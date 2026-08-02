import { describe, it, expect } from 'vitest'
import { Database } from '../database'
import { initializeDatabase } from '../schema'
import { AgentSettingsRepo, TaskRepo, ProjectRepo, SessionRepo } from '../repositories'
import { RpcError } from '../../rpc/errors'
import { tmpDbPath, withDb, withFileDb, seedProject } from './helpers'

function repos(db: Database) {
  return {
    tasks: new TaskRepo(db),
    projects: new ProjectRepo(db),
    sessions: new SessionRepo(db)
  }
}

describe('TaskRepo', () => {
  it('creates and retrieves a task', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      const t = tasks.create({ title: 'Hello' })
      expect(t.title).toBe('Hello')
      expect(t.status).toBe('todo')
      expect(t.pinned).toBe(false)
      expect(tasks.get(t.id)).not.toBeNull()
    })
  })

  it('updates title/description/status and bumps updated_at', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      const t = tasks.create({ title: 'A' })
      const before = t.updatedAt
      const updated = tasks.update({ id: t.id, title: 'B', status: 'done' })
      expect(updated.title).toBe('B')
      expect(updated.status).toBe('done')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
    })
  })

  it('touch updates last_opened_at WITHOUT changing updated_at', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      const t = tasks.create({ title: 'A' })
      const updated0 = t.updatedAt
      const touched = tasks.touch(t.id)
      expect(touched.lastOpenedAt).not.toBeNull()
      // updated_at must not move on a touch
      expect(touched.updatedAt).toBe(updated0)
    })
  })

  it('setPinned toggles pinned and sorts pinned first', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      const a = tasks.create({ title: 'A' })
      const b = tasks.create({ title: 'B' })
      tasks.setPinned(b.id, true)
      const list = tasks.list()
      expect(list[0].id).toBe(b.id) // pinned first
      expect(list[0].pinned).toBe(true)
      expect(list[1].id).toBe(a.id)
    })
  })

  it('database rejects pinned values outside 0 or 1', () => {
    withDb((db) => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO tasks
             (id, title, description, status, branch, sort_order, pinned, created_at, updated_at)
             VALUES ('bad-pin', 'Bad', '', 'todo', '', 0, 2, 1, 1)`
          )
          .run()
      ).toThrow()
    })
  })

  it('delete reports NOT_FOUND for a missing task', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      expect(() => tasks.delete('missing')).toThrowError(
        expect.objectContaining({ code: 'NOT_FOUND' })
      )
    })
  })

  it('list filters by status and keyword', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      tasks.create({ title: 'Fix login bug', description: '' })
      tasks.create({ title: 'Add docs', description: '' })
      tasks.update({ id: tasks.list()[0].id, status: 'done' })
      expect(tasks.list({ status: 'done' })).toHaveLength(1)
      expect(tasks.list({ status: 'todo' })).toHaveLength(1)
      expect(tasks.list({ keyword: 'login' })).toHaveLength(1)
      expect(tasks.list({ keyword: 'LOGIN' })).toHaveLength(1) // case-insensitive
    })
  })

  it('throws NOT_FOUND when updating a missing task', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      expect(() => tasks.update({ id: 'nope', title: 'x' })).toThrow(RpcError)
    })
  })
})

describe('ProjectRepo + foreign keys', () => {
  it('setProject reports NOT_FOUND for a missing project', () => {
    withDb((db) => {
      const { tasks } = repos(db)
      const task = tasks.create({ title: 'A' })
      expect(() => tasks.setProject(task.id, 'missing')).toThrowError(
        expect.objectContaining({ code: 'NOT_FOUND' })
      )
    })
  })
  it('delete RESTRICTs when a task references the project', () => {
    withDb((db) => {
      const { tasks, projects } = repos(db)
      seedProject(db)
      const t = tasks.create({ title: 'A' })
      tasks.setProject(t.id, 'proj-1')
      expect(() => projects.delete('proj-1')).toThrow(RpcError)
      const err = (() => {
        try {
          projects.delete('proj-1')
        } catch (e) {
          return e as RpcError
        }
      })()
      expect(err?.code).toBe('PROJECT_IN_USE')
    })
  })

  it('create rejects a duplicate path_key with CONFLICT', () => {
    withDb((db) => {
      const { projects } = repos(db)
      projects.create({ name: 'R', path: '/r', pathKey: '/r' })
      expect(() => projects.create({ name: 'R2', path: '/r', pathKey: '/r' })).toThrow(
        RpcError
      )
    })
  })

  it('delete succeeds when unreferenced', () => {
    withDb((db) => {
      const { projects } = repos(db)
      projects.create({ name: 'R', path: '/r', pathKey: '/r' })
      projects.delete(/* find id */ projects.getByPathKey('/r')!.id)
      expect(projects.list()).toHaveLength(0)
    })
  })
})

describe('SessionRepo + cascade', () => {
  it('createFromTask snapshots the task project', () => {
    withDb((db) => {
      const { tasks, sessions } = repos(db)
      seedProject(db)
      const t = tasks.create({ title: 'A' })
      tasks.setProject(t.id, 'proj-1')
      const s = sessions.createFromTask(t.id)
      expect(s.taskId).toBe(t.id)
      expect(s.projectId).toBe('proj-1') // snapshot
      expect(s).toMatchObject({
        status: 'unknown',
        agentId: 'opencode',
        agentSessionRef: null,
        agentRunId: null,
        statusSource: 'none',
        statusUpdatedAt: null
      })
    })
  })

  it('stores a structured native Agent session reference used for cold resume', () => {
    withDb((db) => {
      const { tasks, sessions } = repos(db)
      const task = tasks.create({ title: 'Resume me' })
      const created = sessions.createFromTask(task.id)
      const ref = { kind: 'session-id', value: 'ses_native-1' }
      const bound = sessions.setAgentSessionRef(created.id, ref)
      expect(bound.agentSessionRef).toEqual(ref)
      expect(sessions.get(created.id)?.agentSessionRef).toEqual(ref)
    })
  })

  it('rejects a corrupt stored Agent reference instead of treating it as a new session', () => {
    withDb((db) => {
      const { tasks, sessions } = repos(db)
      const task = tasks.create({ title: 'Do not fork history' })
      const created = sessions.createFromTask(task.id)
      db.prepare('UPDATE sessions SET agent_session_ref = ? WHERE id = ?').run(
        '{broken',
        created.id
      )
      expect(() => sessions.get(created.id)).toThrow(
        'Invalid stored Agent session reference'
      )
    })
  })

  it('accepts an open Agent id and records each new run generation', () => {
    withDb((db) => {
      const { tasks, sessions } = repos(db)
      const task = tasks.create({ title: 'Use another adapter' })
      const created = sessions.createFromTask(task.id, 'claude-code')
      expect(created.agentId).toBe('claude-code')
      const running = sessions.startAgentRun(created.id, 'run-1')
      expect(running).toMatchObject({
        agentRunId: 'run-1',
        status: 'unknown',
        statusSource: 'none'
      })
    })
  })

  it('deleting a task CASCADEs its sessions', () => {
    withDb((db) => {
      const { tasks, sessions } = repos(db)
      const t = tasks.create({ title: 'A' })
      sessions.createFromTask(t.id)
      sessions.createFromTask(t.id)
      expect(sessions.listByTask(t.id)).toHaveLength(2)
      tasks.delete(t.id)
      expect(sessions.listByTask(t.id)).toHaveLength(0)
    })
  })

  it('listByProject returns only that project sessions', () => {
    withDb((db) => {
      const { tasks, sessions } = repos(db)
      seedProject(db, 'p1', '/p1')
      seedProject(db, 'p2', '/p2')
      const t1 = tasks.create({ title: 'A' })
      tasks.setProject(t1.id, 'p1')
      const t2 = tasks.create({ title: 'B' })
      tasks.setProject(t2.id, 'p2')
      sessions.createFromTask(t1.id)
      sessions.createFromTask(t2.id)
      expect(sessions.listByProject('p1')).toHaveLength(1)
      expect(sessions.listByProject('p2')).toHaveLength(1)
    })
  })

  it('touch updates last_opened_at only', () => {
    withDb((db) => {
      const { tasks, sessions } = repos(db)
      const t = tasks.create({ title: 'A' })
      const s = sessions.createFromTask(t.id)
      const updated0 = s.updatedAt
      const touched = sessions.touch(s.id)
      expect(touched.lastOpenedAt).not.toBeNull()
      expect(touched.updatedAt).toBe(updated0)
    })
  })
})

describe('AgentSettingsRepo', () => {
  it('provides safe defaults and persists independent runtime and integration choices', () => {
    withDb((db) => {
      const settings = new AgentSettingsRepo(db)
      expect(settings.effective('opencode')).toMatchObject({
        enabled: true,
        integrationEnabled: true,
        executablePath: null,
        isDefault: true
      })

      settings.setExecutablePath('chrys', 'D:\\venv\\chrys.exe')
      settings.setIntegrationEnabled('chrys', false)
      settings.setDefault('chrys')
      expect(settings.effective('chrys')).toMatchObject({
        enabled: true,
        integrationEnabled: false,
        executablePath: 'D:\\venv\\chrys.exe',
        isDefault: true
      })
      expect(settings.effective('opencode').isDefault).toBe(false)
    })
  })

  it('re-enables an Agent when the user makes it the default', () => {
    withDb((db) => {
      const settings = new AgentSettingsRepo(db)
      settings.setEnabled('chrys', false)
      settings.setDefault('chrys')
      expect(settings.effective('chrys')).toMatchObject({
        enabled: true,
        isDefault: true
      })
    })
  })

  it('preserves settings for a temporarily unknown adapter without making it the default', () => {
    withDb((db) => {
      const settings = new AgentSettingsRepo(db)
      settings.setExecutablePath('removed-agent', 'D:\\agents\\removed.exe')
      settings.setIntegrationEnabled('removed-agent', false)
      settings.setEnabled('removed-agent', false)

      expect(settings.effective('removed-agent')).toMatchObject({
        agentId: 'removed-agent',
        enabled: false,
        integrationEnabled: false,
        executablePath: 'D:\\agents\\removed.exe',
        isDefault: false
      })
      expect(settings.effective('opencode').isDefault).toBe(true)
    })
  })

  it('persists versioned adapter values without changing independent runtime choices', () => {
    withDb((db) => {
      const settings = new AgentSettingsRepo(db)
      settings.setEnabled('chrys', false)
      settings.setIntegrationEnabled('chrys', false)
      settings.setValues('chrys', 3, { mode: 'safe', telemetry: false })

      expect(settings.effective('chrys')).toMatchObject({
        enabled: false,
        integrationEnabled: false,
        schemaVersion: 3,
        values: { mode: 'safe', telemetry: false }
      })
    })
  })
})

describe('persistence (file DB reopen)', () => {
  it('data survives close + reopen', () => {
    const path = tmpDbPath()
    let createdId: string
    {
      const db = new Database(path)
      initializeDatabase(db)
      const { tasks } = repos(db)
      createdId = tasks.create({ title: 'Persisted' }).id
      db.close()
    }
    {
      const db = new Database(path)
      const { tasks } = repos(db)
      const t = tasks.get(createdId)
      expect(t?.title).toBe('Persisted')
      db.close()
    }
  })

  it('WAL files coexist without corruption (reopen)', () => {
    withFileDb((_path, db) => {
      const { tasks } = repos(db)
      const t = tasks.create({ title: 'WAL' })
      expect(tasks.get(t.id)).not.toBeNull()
    })
  })
})

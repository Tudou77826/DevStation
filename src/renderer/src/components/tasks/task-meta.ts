import type { TaskStatus } from '@shared/domain'

export const STATUS_META: Record<TaskStatus, { label: string; tone: string }> = {
  todo: { label: '待处理', tone: 'bg-muted-foreground/12 text-muted-foreground' },
  'in-progress': {
    label: '进行中',
    tone: 'bg-status-warning/12 text-status-warning'
  },
  done: { label: '已完成', tone: 'bg-status-success/12 text-status-success' }
}

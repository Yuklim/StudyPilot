import { failureText, statusLabels, type Resource } from './api'
import { resourceTitle } from './resourceTitle'

export function ResourceError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="resource-error" role="alert">
      <p>{failureText(error)}</p>
      {retry && (
        <button className="journal-button" onClick={retry}>
          重新加载
        </button>
      )}
    </div>
  )
}
export function ResourceProgress({ resource }: { resource: Resource }) {
  return (
    <div className="resource-progress">
      <span>
        {statusLabels[resource.progress.status]} · {resource.progress.progress_percent}%
      </span>
      <progress
        max={100}
        value={resource.progress.progress_percent}
        aria-label={`${resourceTitle(resource)}的学习进度`}
      />
    </div>
  )
}

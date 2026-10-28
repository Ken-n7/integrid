export function SaveWarning({ onRetry }: { onRetry?: () => void }) {
  return <div className="game-save-warning" role="alert">
    <span>Progress can’t be saved on this device. Keep this tab open and ask your teacher for help.</span>
    {onRetry && <button className="link" onClick={onRetry}>Retry save</button>}
  </div>
}

export default function Chip({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <span className="chip">
      {text}
      <button 
        type="button" 
        className="chip-close" 
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>
    </span>
  )
}
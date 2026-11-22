import { useEffect, useRef, useState } from 'react'
import { ImageUp, AlertTriangle } from 'lucide-react'

/** Screenshot -> text in the browser (tesseract.js). Drop, browse or Ctrl+V. */
export default function ImageOCR({ onText, hint = 'Tracker rows, WhatsApp chats, Outlook mails, forms' }) {
  const [progress, setProgress] = useState(null)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState('')
  const input = useRef()
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  async function run(file) {
    if (!file?.type.startsWith('image/')) return setErr('Choose an image (PNG, JPG or a screenshot).')
    setErr(''); setPreview(URL.createObjectURL(file)); setProgress(0)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, { logger: (m) => m.status === 'recognizing text' && setProgress(Math.round(m.progress * 100)) })
      const { data } = await worker.recognize(file)
      await worker.terminate()
      if (!data.text.trim()) throw new Error('No text found in the image.')
      onTextRef.current(data.text.trim())
    } catch (e) { setErr(e.message.includes('fetch') ? 'Could not download the text reader (needs internet the first time).' : e.message) } finally { setProgress(null) }
  }
  useEffect(() => {
    const paste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); run(f) } }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [])

  return (
    <div className="ocr">
      <button className="drop-zone small" onClick={() => input.current.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); run(e.dataTransfer.files[0]) }}>
        {preview ? <img src={preview} alt="Uploaded screenshot" /> : <ImageUp size={26} aria-hidden="true" />}
        <strong>{progress != null ? `Reading text… ${progress}%` : 'Drop a screenshot, click to browse, or press Ctrl+V'}</strong>
        <span>{hint}</span>
        {progress != null && <span className="bar"><i style={{ width: `${progress}%` }} /></span>}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { run(e.target.files[0]); e.target.value = '' }} />
      {err && <p className="status bad"><AlertTriangle size={14} /> {err}</p>}
    </div>
  )
}

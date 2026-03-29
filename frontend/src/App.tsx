import { useState, useRef, type ChangeEvent, type FormEvent } from 'react'
import './App.css'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState('')
  const [usage, setUsage] = useState<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    if (selected) {
      const url = URL.createObjectURL(selected)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setResult('')
    setUsage(null)

    const formData = new FormData()
    formData.append('image', file)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.text()
        setResult(`Error: ${res.status} - ${err}`)
        return
      }

      const data = await res.json()
      if (data.usage) setUsage(data.usage)
      const display = data.workflow ?? data.raw ?? data
      setResult(JSON.stringify(display, null, 2))
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <h1>Approval Workflow Analyzer</h1>
      <p className="description">
        Upload an image of an approval workflow diagram to analyze it.
      </p>

      <form onSubmit={handleSubmit} className="upload-form">
        <div className="file-input-wrapper">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>

        {preview && (
          <div className="preview">
            <img src={preview} alt="Workflow diagram preview" />
          </div>
        )}

        <button type="submit" disabled={!file || loading}>
          {loading ? 'Analyzing...' : 'Analyze Workflow'}
        </button>
      </form>

      <div className="result">
        <label htmlFor="result">Result:</label>
        <textarea
          id="result"
          value={result}
          readOnly
          rows={20}
          placeholder="Analysis result will appear here..."
        />
        {usage && (
          <p className="usage">
            Tokens — prompt: {usage.promptTokens}, completion: {usage.completionTokens}, total: {usage.totalTokens}
          </p>
        )}
      </div>
    </div>
  )
}

export default App

import React, { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import QRCode from 'qrcode'
import './styles.css'

const tools = [
  { id: 'convert', icon: '⇄', title: 'Image Converter', text: 'Convert JPG, PNG and WebP images in seconds.' },
  { id: 'compress', icon: '◒', title: 'Image Compressor', text: 'Make image files smaller without losing quality.' },
  { id: 'resize', icon: '⛶', title: 'Image Resizer', text: 'Resize images to the exact dimensions you need.' },
  { id: 'qr', icon: '▦', title: 'QR Generator', text: 'Create clean QR codes for any link or text.' },
]

function App() {
  const [activeTool, setActiveTool] = useState('convert')
  const [file, setFile] = useState(null)
  const [quality, setQuality] = useState(82)
  const [format, setFormat] = useState('image/png')
  const [dimensions, setDimensions] = useState({ width: '', height: '' })
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)
  const active = tools.find((tool) => tool.id === activeTool)

  const pickFile = (files) => {
    const next = files?.[0]
    if (!next || !next.type.startsWith('image/')) return
    setFile(next); setResult(null)
    const image = new Image()
    image.onload = () => setDimensions({ width: String(image.width), height: String(image.height) })
    image.src = URL.createObjectURL(next)
  }

  const processImage = () => {
    if (!file) return
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const width = activeTool === 'resize' ? Number(dimensions.width) || image.width : image.width
      const height = activeTool === 'resize' ? Number(dimensions.height) || image.height : image.height
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(image, 0, 0, width, height)
      const type = activeTool === 'convert' ? format : 'image/jpeg'
      canvas.toBlob((blob) => blob && setResult({ url: URL.createObjectURL(blob), size: blob.size, type }), type, quality / 100)
    }
    image.src = URL.createObjectURL(file)
  }

  const download = () => {
    if (!result) return
    const extension = result.type.split('/')[1].replace('jpeg', 'jpg')
    const link = document.createElement('a')
    link.href = result.url; link.download = `${file.name.replace(/\.[^.]+$/, '')}-toolbox.${extension}`; link.click()
  }

  return <div className="site-shell">
    <header className="topbar">
      <a className="brand" href="#top"><span>✦</span> toolbox</a>
      <nav><a href="#tools">Tools</a><a href="#how-it-works">How it works</a><a href="#about">About</a></nav>
      <button className="header-button" onClick={() => document.querySelector('#tools')?.scrollIntoView({ behavior: 'smooth' })}>Explore tools <span>→</span></button>
    </header>
    <main id="top">
      <section className="hero-section">
        <div className="hero-copy"><p className="kicker"><span className="spark">✦</span>SIMPLE ONLINE UTILITIES</p><h1>Small tools.<br /><em>Big relief.</em></h1><p className="hero-text">Fast, private and beautifully simple tools for the everyday tasks that slow you down.</p><div className="hero-actions"><button className="primary" onClick={() => document.querySelector('#tools')?.scrollIntoView({ behavior: 'smooth' })}>Try a tool <span>→</span></button><span className="no-signup">No sign-up required</span></div></div>
        <div className="hero-art" aria-hidden="true"><div className="sun" /><div className="floating-card card-one"><span>✦</span><b>Ready in<br />seconds</b></div><div className="floating-card card-two"><span>⌁</span><b>Files stay<br />private</b></div><div className="smile">⌒</div><div className="line line-one" /><div className="line line-two" /></div>
      </section>
      <section id="tools" className="tools-section"><div className="section-title"><p className="kicker">PICK A TOOL</p><h2>Made for getting it done.</h2></div><div className="tool-grid">{tools.map((tool) => <button key={tool.id} onClick={() => { setActiveTool(tool.id); setResult(null) }} className={`tool-card ${activeTool === tool.id ? 'selected' : ''}`}><span className="tool-icon">{tool.icon}</span><strong>{tool.title}</strong><span>{tool.text}</span><i>→</i></button>)}</div></section>
      <section className="workspace"><div className="workspace-heading"><p className="kicker">{active.title.toUpperCase()}</p><h2>Drop it here, we’ll handle the rest.</h2></div>{activeTool === 'qr' ? <QrTool /> : <>{!file ? <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); pickFile(event.dataTransfer.files) }}><input ref={inputRef} type="file" accept="image/*" onChange={(event) => pickFile(event.target.files)} /><span className="upload-mark">↑</span><strong>Drop your image here</strong><span>or <u>browse files</u> from your device</span><small>JPG, PNG or WebP · Max 20MB</small></label> : <div className="editor"><div className="file-row"><div className="file-badge">{file.type.includes('png') ? 'PNG' : 'JPG'}</div><div><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(2)} MB · {dimensions.width} × {dimensions.height}px</span></div><button className="remove" onClick={() => { setFile(null); setResult(null) }}>×</button></div><div className="options">{activeTool === 'convert' && <label>Convert to<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></label>}{activeTool === 'resize' && <><label>Width (px)<input value={dimensions.width} onChange={(event) => setDimensions({ ...dimensions, width: event.target.value })} /></label><label>Height (px)<input value={dimensions.height} onChange={(event) => setDimensions({ ...dimensions, height: event.target.value })} /></label></>}{activeTool === 'compress' && <label className="range-label">Quality <b>{quality}%</b><input type="range" min="20" max="100" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>}</div>{!result ? <button className="primary process" onClick={processImage}>{activeTool === 'compress' ? 'Compress image' : activeTool === 'resize' ? 'Resize image' : 'Convert image'} <span>→</span></button> : <div className="result"><span>✓</span><div><strong>Your file is ready!</strong><small>{(result.size / 1024 / 1024).toFixed(2)} MB output</small></div><button className="download" onClick={download}>Download ↓</button></div>}</div>}</>}</section>
      <section id="how-it-works" className="steps"><div><p className="kicker">HOW IT WORKS</p><h2>Nothing complicated.</h2></div><ol><li><b>01</b><span>Choose the tool you need.</span></li><li><b>02</b><span>Add your file and pick your settings.</span></li><li><b>03</b><span>Download your finished file.</span></li></ol></section>
    </main><footer id="about"><a className="brand" href="#top"><span>✦</span> toolbox</a><p>Practical tools, thoughtfully made.</p><span>© 2026 toolbox</span></footer>
  </div>
}

function QrTool() {
  const [text, setText] = useState('https://example.com')
  const [qrUrl, setQrUrl] = useState('')
  const createQr = async () => {
    if (!text.trim()) return
    setQrUrl(await QRCode.toDataURL(text, { width: 560, margin: 2, color: { dark: '#173b30', light: '#fffdf9' } }))
  }
  const downloadQr = () => {
    const link = document.createElement('a')
    link.href = qrUrl; link.download = 'toolbox-qr-code.png'; link.click()
  }
  return <div className="qr-tool"><div className="qr-preview">{qrUrl ? <img style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} src={qrUrl} alt={`QR code for ${text}`} /> : '▦'}</div><div><label>Link or text<input value={text} onChange={(event) => { setText(event.target.value); setQrUrl('') }} /></label>{qrUrl ? <button className="primary" onClick={downloadQr}>Download QR <span>↓</span></button> : <button className="primary" onClick={createQr}>Generate QR <span>→</span></button>}<small>{qrUrl ? 'Your QR code is ready to download.' : 'Enter a link or message, then generate.'}</small></div></div>
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)

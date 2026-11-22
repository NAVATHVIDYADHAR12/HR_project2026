'use client'
import dynamic from 'next/dynamic'

// The app is a browser-only React app (theme from localStorage, Web Speech, OCR), so it skips server rendering.
const Root = dynamic(() => import('../../web/src/Root.jsx'), { ssr: false, loading: () => <div className="boot" aria-label="Loading"><span className="brand-mark">T</span></div> })

export default function Page() { return <Root /> }

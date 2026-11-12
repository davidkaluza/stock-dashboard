import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './Root.jsx'
import './index.css'
import { applyStoredTheme } from './lib/theme'

applyStoredTheme()

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full p-8 font-mono">
          <h1 className="text-lg font-bold mb-2">Fehler</h1>
          <p className="mb-2">Die Anwendung ist abgestürzt:</p>
          <pre className="text-xs whitespace-pre-wrap border border-line rounded-lg p-3">
            {String(this.state.error.message || this.state.error)}
          </pre>
          <button
            onClick={() => location.reload()}
            className="mt-4 border border-line rounded-lg px-3 py-1.5 hover:opacity-80"
          >
            Neu laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
)

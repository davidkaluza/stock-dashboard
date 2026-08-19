import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

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
          <pre className="text-xs whitespace-pre-wrap border border-accent p-3">
            {String(this.state.error.message || this.state.error)}
          </pre>
          <button
            onClick={() => location.reload()}
            className="mt-4 border border-accent px-3 py-1.5 hover:opacity-80"
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
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

import React, { Component } from 'react';
import { AlertCircle } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("CuteBI Render Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-red-50 p-8 text-center">
          <AlertCircle size={48} className="text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-red-700 mb-2">Oops! Something went wrong.</h2>
          <p className="text-red-600 mb-6 max-w-md">The application encountered an unexpected error while rendering a component.</p>
          <div className="bg-white p-4 rounded-lg shadow-sm w-full max-w-2xl text-left overflow-auto border border-red-100">
             <pre className="text-xs text-red-500 font-mono">
                {this.state.error && this.state.error.toString()}
             </pre>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-8 bg-red-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-red-700 transition"
          >
            Refresh App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

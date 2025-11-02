import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { hasError:false, err:null } }
  static getDerivedStateFromError(err){ return { hasError:true, err } }
  componentDidCatch(err, info){ console.error('Caught by ErrorBoundary:', err, info) }
  render(){
    if (this.state.hasError){
      return <pre style={{ whiteSpace:'pre-wrap', color:'crimson', padding:16 }}>{String(this.state.err)}</pre>;
    }
    return this.props.children;
  }
}

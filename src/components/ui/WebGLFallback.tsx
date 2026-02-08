const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  padding: '2rem',
  textAlign: 'center',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

const headingStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  marginBottom: '1rem',
  color: 'var(--error-color, #f85149)',
};

const textStyle: React.CSSProperties = {
  color: 'var(--text-secondary, #8b949e)',
  maxWidth: '500px',
  lineHeight: 1.6,
};

export function WebGLFallback() {
  return (
    <div style={containerStyle}>
      <h1 style={headingStyle}>WebGL 2.0 Required</h1>
      <p style={textStyle}>
        MolViewer requires WebGL 2.0 to render 3D molecular structures.
        Your browser or device does not appear to support it.
        Please try updating your browser or using a device with GPU acceleration enabled.
      </p>
    </div>
  );
}

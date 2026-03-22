// Sparkline SVG minimaliste pour afficher l'historique de population d'une espèce

export default function Sparkline({ data, color = '#3b82f6', width = 80, height = 24 }) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height}><line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#374151" strokeWidth="1" /></svg>;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastVal = data[data.length - 1];
  const lastX = width;
  const lastY = height - ((lastVal - min) / range) * (height - 4) - 2;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

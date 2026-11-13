export default function BrandLogo({ size = 36, className = '' }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}cloudmonitor-logo.png`}
      alt="CloudMonitor"
      width={size}
      height={size}
      className={`block shrink-0 object-contain ${className}`}
      draggable={false}
    />
  );
}

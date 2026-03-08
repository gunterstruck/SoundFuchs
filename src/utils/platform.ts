export function isIOS(): boolean {
  // Prüft auf iPhone/iPad UserAgent oder Mac mit Touch (iPadOS 13+)
  return (
    [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod',
    ].includes(navigator.platform) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
  );
}

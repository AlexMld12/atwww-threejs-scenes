/** The underline sweep of TAKE QUIZ / BUY NOW / JOIN CLUB (`.cta__line`): it runs on hover and always finishes. */
export function startSweep(host: HTMLElement) {
  const line = host.querySelector<HTMLElement>('.cta__line');
  if (!line) return () => {};
  const play = () => {
    line.classList.remove('is-sweeping');
    requestAnimationFrame(() => line.classList.add('is-sweeping'));
  };
  const done = () => line.classList.remove('is-sweeping');
  host.addEventListener('mouseenter', play);
  host.addEventListener('focus', play);
  line.addEventListener('animationend', done);
  return () => {
    host.removeEventListener('mouseenter', play);
    host.removeEventListener('focus', play);
    line.removeEventListener('animationend', done);
  };
}

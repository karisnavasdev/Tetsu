// Runs before first paint (a plain script in <head>): the visitor's saved theme, else their system's.
(function () {
  var t = null;
  try { t = localStorage.getItem('tsu.theme'); } catch (e) {}
  if (t !== 'paper' && t !== 'night') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper';
  document.documentElement.setAttribute('data-theme', t);
})();

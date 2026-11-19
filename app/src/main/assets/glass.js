(function () {
  const KEY = 'glassOn';
  const toggle = document.getElementById('glassToggle');

  function applyGlass(on) {
    document.documentElement.classList.toggle('glass', on);
  }

  const saved = localStorage.getItem(KEY);
  const on = saved === null ? true : saved === '1';

  applyGlass(on);
  if (toggle) {
    toggle.checked = on;
    toggle.addEventListener('change', () => {
      localStorage.setItem(KEY, toggle.checked ? '1' : '0');
      applyGlass(toggle.checked);
    });
  }
})();

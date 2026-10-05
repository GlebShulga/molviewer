/**
 * Footer groups: plain columns on desktop, an accordion on phones.
 *
 * The HTML ships with every <details> open, so crawlers and browsers without
 * JavaScript see all the links. On phones this script collapses them, and it
 * keeps the groups open on desktop, where a click on a summary does nothing.
 */
(function () {
  var mq = window.matchMedia('(max-width: 768px)');

  function sync() {
    var groups = document.querySelectorAll('.site-footer details');
    for (var i = 0; i < groups.length; i++) {
      groups[i].open = !mq.matches;
      // On desktop the summary is not a control: keep it out of the tab order
      // so nobody lands on a toggle that does nothing.
      var summary = groups[i].querySelector('summary');
      if (summary) {
        if (mq.matches) summary.removeAttribute('tabindex');
        else summary.setAttribute('tabindex', '-1');
      }
    }
  }

  sync();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  mq.addEventListener('change', sync);

  document.addEventListener('click', function (e) {
    var summary = e.target instanceof Element ? e.target.closest('.site-footer summary') : null;
    if (summary && !mq.matches) e.preventDefault();
  });
})();

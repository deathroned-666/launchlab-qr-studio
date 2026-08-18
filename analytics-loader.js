(function () {
  var tokenMeta = document.querySelector('meta[name="cf-web-analytics-token"]');
  var token = tokenMeta && tokenMeta.getAttribute('content');

  if (!token || token === 'PASTE_CLOUDFLARE_ANALYTICS_TOKEN_HERE') {
    return;
  }

  var script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
  document.head.appendChild(script);
})();

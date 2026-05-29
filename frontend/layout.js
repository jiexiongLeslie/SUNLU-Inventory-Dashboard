(function() {
  'use strict';

  var pages = [
    { group: '核心看板', title: '库存数据看板', desc: '英美欧库存总览', href: '/', icon: 'dashboard' },
    { group: '核心看板', title: '库龄分析', desc: '库存结构和动销', href: '/inventory-age.html', icon: 'age' },
    { group: 'Shopify', title: 'Shopify 库存', desc: '店铺 SKU 库存', href: '/shopify.html', icon: 'box' },
    { group: 'Shopify', title: '链接访问量', desc: '站点链接数据', href: '/shopify-links.html', icon: 'link' },
    { group: 'Shopify', title: '每日访问销量', desc: '5 站点每日访客和销量', href: '/daily-traffic-sales.html', icon: 'pulse' },
    { group: 'Shopify', title: '每日 SKU 销量', desc: '5 站点每日店铺 SKU 销量', href: '/daily-sku-sales.html', icon: 'trend' },
    { group: '维护工具', title: 'SKU 映射', desc: '单品与套装规则', href: '/sku-mapping.html', icon: 'tag' },
    { group: '维护工具', title: '数据诊断', desc: '质量问题检查', href: '/quality.html', icon: 'check' }
  ];

  var icons = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
    age: '<path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/><path d="M3 12h3M18 12h3"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/><path d="M4 19h16"/><path d="M4 5h16"/>',
    trend: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-7"/><path d="M17 6h1v1"/>',
    sales: '<path d="M3 17h3v4H3z"/><path d="M10.5 11h3v10h-3z"/><path d="M18 7h3v14h-3z"/><path d="M4 13l6-5 4 3 6-7"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><path d="M7 7h.01"/>',
    check: '<path d="M9 12l2 2 4-5"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>'
  };

  function normalizePath(path) {
    if (!path || path === '/index.html') return '/';
    return path.replace(/\/+$/, '') || '/';
  }

  function isActive(href) {
    return normalizePath(location.pathname) === normalizePath(href);
  }

  function navIcon(name) {
    return '<span class="sunlu-nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg></span>';
  }

  function renderNav() {
    var currentGroup = '';
    return pages.map(function(page) {
      var label = '';
      if (page.group !== currentGroup) {
        currentGroup = page.group;
        label = '<div class="sunlu-nav-label">' + page.group + '</div>';
      }
      return label +
        '<a class="sunlu-nav-item' + (isActive(page.href) ? ' active' : '') + '" href="' + page.href + '" title="' + page.desc + '">' +
          navIcon(page.icon) +
          '<span>' + page.title + '</span>' +
        '</a>';
    }).join('');
  }

  function createShell() {
    if (document.querySelector('.sunlu-sidebar')) return;
    document.body.classList.add('sunlu-layout');
    var aside = document.createElement('aside');
    aside.className = 'sunlu-sidebar';
    aside.innerHTML =
      '<div class="sunlu-sidebar__brand">' +
        '<div class="sunlu-sidebar__mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16v16H4V4Zm2 2v12h12V6H6Zm2 2h4v4H8V8Zm6 0h3v2h-3V8Zm0 4h3v2h-3v-2ZM8 15h9v2H8v-2Z"/></svg></div>' +
        '<div><div class="sunlu-sidebar__title">SUNLU 库存系统</div><div class="sunlu-sidebar__sub">Inventory Console</div></div>' +
      '</div>' +
      '<nav class="sunlu-sidebar__nav" aria-label="主导航">' + renderNav() + '</nav>' +
      '<div class="sunlu-sidebar__foot">数据范围：库存表 + Shopify 五站<br>库存 / 流量 / SKU / 销售监控</div>';
    document.body.insertBefore(aside, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createShell);
  } else {
    createShell();
  }
})();

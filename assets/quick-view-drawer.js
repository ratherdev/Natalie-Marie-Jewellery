/* ============================================================
   QUICK VIEW DRAWER — NMJ Prestage Theme
   File: assets/quick-view-drawer.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ── Build drawer HTML ────────────────────────────────────────
  var drawerHTML = [
    '<div id="qv-drawer-overlay" aria-hidden="true">',
      '<div id="qv-drawer" role="dialog" aria-modal="true" aria-label="Quick View">',
        '<div id="qv-drawer-header">',
          '<button id="qv-drawer-close" type="button" aria-label="Close">',
            '<svg width="18" height="18" viewBox="0 0 18 18" fill="none">',
              '<path d="M1 1l16 16M17 1L1 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
            '</svg>',
          '</button>',
          '<span id="qv-drawer-title"></span>',
        '</div>',
        '<div id="qv-drawer-body">',
          '<div id="qv-drawer-loading"><div class="qv-spinner"></div></div>',
          '<div id="qv-drawer-content"></div>',
        '</div>',
        '<div id="qv-drawer-footer">',
          '<a id="qv-full-link" href="#">View full product details</a>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');

  document.body.insertAdjacentHTML('beforeend', drawerHTML);

  var overlay  = document.getElementById('qv-drawer-overlay');
  var closeBtn = document.getElementById('qv-drawer-close');
  var loading  = document.getElementById('qv-drawer-loading');
  var content  = document.getElementById('qv-drawer-content');
  var titleEl  = document.getElementById('qv-drawer-title');
  var fullLink = document.getElementById('qv-full-link');

  var lastHandle = null;
  var isOpen     = false;

  // ── Open ─────────────────────────────────────────────────────
  function openDrawer(handle, title) {
    titleEl.textContent = title || '';
    fullLink.href = '/products/' + handle;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-open');
    document.body.classList.add('qv-open');
    isOpen = true;

    if (handle === lastHandle) return;
    lastHandle = handle;

    content.style.display = 'none';
    content.innerHTML = '';
    loading.style.display = 'flex';

    fetch('/products/' + handle)
      .then(function (r) { return r.text(); })
      .then(function (html) { injectContent(html, handle); })
      .catch(function (err) {
        loading.style.display = 'none';
        content.innerHTML = '<p class="qv-error">Unable to load product. <a href="/products/' + handle + '">View full page</a></p>';
        content.style.display = 'block';
        console.error('[QuickView]', err);
      });
  }

  // ── Close ─────────────────────────────────────────────────────
  function closeDrawer() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('qv-open');
    isOpen = false;
    lastHandle = null;
    content.innerHTML = '';
  }

  // ── Best image URL from an <img> element ─────────────────────
  // Handles BOTH old lazy-load pattern (data-src + data-widths)
  // AND new Shopify image_tag pattern (src + srcset, no data-src)
  function getBestImageUrl(img) {
    var TARGET = 800;

    // Pattern 1: old lazy-load — data-src with {width} template
    var dataSrc = img.getAttribute('data-src') || '';
    if (dataSrc && dataSrc.indexOf('{width}') !== -1) {
      var widths = [];
      try { widths = JSON.parse(img.getAttribute('data-widths') || '[]'); } catch (e) {}
      var chosen = TARGET;
      if (widths.length) {
        var larger = widths.filter(function (w) { return w >= TARGET; });
        chosen = larger.length ? Math.min.apply(null, larger) : Math.max.apply(null, widths);
      }
      return dataSrc.replace('{width}', chosen);
    }

    // Pattern 2: data-src already a real URL (no template)
    if (dataSrc && dataSrc.indexOf('{width}') === -1 && dataSrc.length > 4) {
      return dataSrc;
    }

    // Pattern 3: new image_tag — srcset="url 200w, url 400w, ..."
    var srcset = img.getAttribute('srcset') || '';
    if (srcset) {
      var best = null;
      var bestW = 0;
      srcset.split(',').forEach(function (part) {
        var bits = part.trim().split(/\s+/);
        if (bits.length < 2) return;
        var url = bits[0];
        var w   = parseInt(bits[1]) || 0;
        // Pick the smallest width >= TARGET, else the largest available
        if (!best || (w >= TARGET && w < bestW) || (bestW < TARGET && w > bestW)) {
          best  = url;
          bestW = w;
        }
      });
      if (best) return best;
    }

    // Pattern 4: plain src
    var src = img.getAttribute('src') || '';
    if (src && src.length > 4) return src;

    return null;
  }

  // ── Inject content ────────────────────────────────────────────
  function injectContent(html, handle) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(html, 'text/html');

    if (!titleEl.textContent.trim()) {
      var h1 = doc.querySelector('h1');
      if (h1) titleEl.textContent = h1.textContent.trim();
    }

    // Find gallery element
    var galleryEl = null;
    var gallerySelectors = ['.Product__Gallery', '.Product__Slideshow', '.Product__Media', '[data-product-gallery]'];
    for (var gi = 0; gi < gallerySelectors.length; gi++) {
      galleryEl = doc.querySelector(gallerySelectors[gi]);
      if (galleryEl) break;
    }

    // Find product info / form element
    var formEl = null;
    var formSelectors = ['.Product__Info', '.ProductMeta', '.Product__Sidebar', '.product__info-wrapper', '[data-product-form]'];
    for (var fi = 0; fi < formSelectors.length; fi++) {
      formEl = doc.querySelector(formSelectors[fi]);
      if (formEl) break;
    }
    if (!formEl) formEl = doc.querySelector('.Product') || doc.querySelector('main') || doc.body;

    // ── Collect images ────────────────────────────────────────
    var images = [];
    var seen   = {};

    if (galleryEl) {
      // First pass: .Product__SlideItem--image slides
      var slideItems = galleryEl.querySelectorAll('.Product__SlideItem--image');
      if (!slideItems.length) {
        slideItems = galleryEl.querySelectorAll('.Product__SlideItem');
      }

      slideItems.forEach(function (slide) {
        // Each slide may have multiple imgs (noscript fallback etc) — take the first real one
        var imgs = slide.querySelectorAll('img');
        for (var ii = 0; ii < imgs.length; ii++) {
          var url = getBestImageUrl(imgs[ii]);
          if (url && !seen[url]) {
            seen[url] = true;
            images.push(url);
            break;
          }
        }
      });

      // Second pass fallback: any img inside the gallery
      if (!images.length) {
        galleryEl.querySelectorAll('img').forEach(function (img) {
          var url = getBestImageUrl(img);
          if (url && !seen[url] && url.indexOf('cdn.shopify') !== -1) {
            seen[url] = true;
            images.push(url);
          }
        });
      }
    }

    // ── Build gallery column ──────────────────────────────────
    content.innerHTML = '';
    var galleryWrap = document.createElement('div');
    galleryWrap.className = 'qv-gallery';

    if (images.length) {
      var sliderEl = document.createElement('div');
      sliderEl.className = 'qv-slider';

      var slidesEl = document.createElement('div');
      slidesEl.className = 'qv-slides';

      images.forEach(function (src, idx) {
        var slide = document.createElement('div');
        slide.className = 'qv-slide';
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.loading = idx === 0 ? 'eager' : 'lazy';
        slide.appendChild(img);
        slidesEl.appendChild(slide);
      });
      sliderEl.appendChild(slidesEl);

      if (images.length > 1) {
        var prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'qv-arrow qv-arrow--prev';
        prevBtn.setAttribute('aria-label', 'Previous image');
        prevBtn.innerHTML = '<svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M9 1L1 8l8 7" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        sliderEl.appendChild(prevBtn);

        var nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'qv-arrow qv-arrow--next';
        nextBtn.setAttribute('aria-label', 'Next image');
        nextBtn.innerHTML = '<svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M1 1l8 7-8 7" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        sliderEl.appendChild(nextBtn);
      }

      galleryWrap.appendChild(sliderEl);

      if (images.length > 1) {
        var thumbsEl = document.createElement('div');
        thumbsEl.className = 'qv-thumbs';
        images.forEach(function (src, idx) {
          var thumb = document.createElement('div');
          thumb.className = 'qv-thumb' + (idx === 0 ? ' is-active' : '');
          var tImg = document.createElement('img');
          tImg.src = src;
          tImg.alt = '';
          tImg.loading = 'lazy';
          thumb.appendChild(tImg);
          thumbsEl.appendChild(thumb);
        });
        galleryWrap.appendChild(thumbsEl);
      }
    } else {
      galleryWrap.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:13px;">No image</div>';
    }

    content.appendChild(galleryWrap);

    // ── Info column ───────────────────────────────────────────
    var infoWrap = document.createElement('div');
    infoWrap.className = 'qv-info';
    infoWrap.innerHTML = formEl ? formEl.innerHTML : '';
    content.appendChild(infoWrap);

    // Init slider
    if (images.length > 1) initSlider(galleryWrap);

    // Inject inline styles
    doc.querySelectorAll('style').forEach(function (s) {
      var clone = document.createElement('style');
      clone.textContent = s.textContent;
      clone.setAttribute('data-qv-injected', '1');
      document.head.appendChild(clone);
    });

    // Fix any remaining lazy-load images inside the info column
    infoWrap.querySelectorAll('img').forEach(function (img) {
      var url = getBestImageUrl(img);
      if (url) img.src = url;
      img.removeAttribute('data-src');
      img.removeAttribute('data-widths');
      img.classList.remove('Image--lazyLoad');
    });

    // Fix relative links
    content.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (href && href.charAt(0) === '/' && href.charAt(1) !== '/') {
        a.href = window.location.origin + href;
      }
    });

    reinitTheme(content, handle);

    loading.style.display = 'none';
    content.style.display = 'flex';
  }

  // ── Re-init theme components ──────────────────────────────────
  function reinitTheme(container, handle) {
    document.dispatchEvent(new CustomEvent('quickview:loaded', { bubbles: true, detail: { container: container, handle: handle } }));

    // data-action="open-drawer"
    container.querySelectorAll('[data-action="open-drawer"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.dispatchEvent(new CustomEvent('drawer:open', { detail: { id: this.getAttribute('data-drawer-id') } }));
      });
    });

    // Popovers
    container.querySelectorAll('[aria-controls]').forEach(function (trigger) {
      var targetId = trigger.getAttribute('aria-controls');
      var target   = container.querySelector('#' + targetId);
      if (!target) return;
      trigger.addEventListener('click', function () {
        var isExpanded = this.getAttribute('aria-expanded') === 'true';
        container.querySelectorAll('[aria-expanded="true"]').forEach(function (el) { el.setAttribute('aria-expanded', 'false'); });
        container.querySelectorAll('.Popover, .OptionSelector, .VariantSelector').forEach(function (el) { el.setAttribute('aria-hidden', 'true'); });
        if (!isExpanded) {
          trigger.setAttribute('aria-expanded', 'true');
          target.setAttribute('aria-hidden', 'false');
        }
      });
    });

    content.addEventListener('click', function (e) {
      if (!e.target.closest('[aria-controls]') && !e.target.closest('.Popover') && !e.target.closest('.OptionSelector')) {
        container.querySelectorAll('[aria-expanded="true"]').forEach(function (el) { el.setAttribute('aria-expanded', 'false'); });
        container.querySelectorAll('.Popover, .OptionSelector').forEach(function (el) { el.setAttribute('aria-hidden', 'true'); });
      }
    });

    // Select value in popover
    container.querySelectorAll('[data-action="select-value"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var position = this.getAttribute('data-option-position');
        var value    = this.getAttribute('data-value');
        var radio    = container.querySelector('input[data-option-position="' + position + '"][value="' + value + '"]');
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        var grp = this.closest('.ProductForm__Option, .VariantSelector');
        if (grp) grp.querySelectorAll('.ProductForm__SelectedValue').forEach(function (el) { el.textContent = value; });
        var pop = this.closest('.Popover, .OptionSelector');
        if (pop) {
          pop.setAttribute('aria-hidden', 'true');
          var trig = container.querySelector('[aria-controls="' + pop.id + '"]');
          if (trig) trig.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Radio change → update label
    container.querySelectorAll('input[type="radio"][data-option-position]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var pos = this.getAttribute('data-option-position');
        container.querySelectorAll('.ProductForm__SelectedValue[data-option-position="' + pos + '"]').forEach(function (el) { el.textContent = radio.value; });
      });
    });

    // Toggle optional customisations — mirrors theme _toggleContent exactly
    container.querySelectorAll('[data-action="toggle-content"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var toggleId = this.getAttribute('data-toggle-id');
        var wrapper  = container.querySelector('.CustomLineProperties');
        var targetEl = container.querySelector('#' + toggleId);
        if (!wrapper || !targetEl) return;

        if (this.classList.contains('is-active')) {
          container.querySelectorAll('.CustomLineProperties_Item.is-active').forEach(function (el) { el.classList.remove('is-active'); });
          container.querySelectorAll('.CustomLineProperties > .is-active').forEach(function (el) { el.classList.remove('is-active'); });
          wrapper.style.height = '0px';
          wrapper.classList.remove('is-active');
        } else {
          container.querySelectorAll('.CustomLineProperties_Item.is-active').forEach(function (el) { el.classList.remove('is-active'); });
          this.classList.add('is-active');

          // Measure height while temporarily visible
          var prevVis = targetEl.style.visibility;
          var prevPos = targetEl.style.position;
          targetEl.style.visibility = 'hidden';
          targetEl.style.position   = 'relative';
          targetEl.classList.add('is-active');
          var h = targetEl.scrollHeight || targetEl.clientHeight;
          targetEl.style.visibility = prevVis;
          targetEl.style.position   = prevPos;

          wrapper.style.height = h + 'px';
          wrapper.classList.add('is-active');

          wrapper.querySelectorAll('.customLineProperty--optional').forEach(function (el) {
            if (el !== targetEl) el.classList.remove('is-active');
          });
          targetEl.classList.add('is-active');
        }
      });
    });

    // CustomLineProperties_Close
    container.querySelectorAll('.CustomLineProperties_Close').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrapper = container.querySelector('.CustomLineProperties');
        if (!wrapper) return;
        container.querySelectorAll('.CustomLineProperties_Item.is-active').forEach(function (el) { el.classList.remove('is-active'); });
        container.querySelectorAll('.CustomLineProperties > .is-active').forEach(function (el) { el.classList.remove('is-active'); });
        wrapper.style.height = '0px';
        wrapper.classList.remove('is-active');
      });
    });

    // Carousel variant selector
    container.querySelectorAll('[data-action="select-variant"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var vs = this.closest('.VariantSelector');
        if (!vs) return;
        var sel = vs.querySelector('.VariantSelector__Item.is-selected');
        if (sel) {
          var radio = container.querySelector('input[data-option-position="' + sel.getAttribute('data-option-position') + '"][value="' + sel.getAttribute('data-option-value') + '"]');
          if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        vs.setAttribute('aria-hidden', 'true');
      });
    });

    container.querySelectorAll('.VariantSelector__Item').forEach(function (item) {
      item.addEventListener('click', function () {
        var carousel = this.closest('.VariantSelector__Carousel');
        if (carousel) carousel.querySelectorAll('.VariantSelector__Item').forEach(function (i) { i.classList.remove('is-selected'); });
        this.classList.add('is-selected');
      });
    });

    // Character counters
    container.querySelectorAll('textarea[maxlength], input[type="text"][maxlength]').forEach(function (inp) {
      var indicator = inp.nextElementSibling;
      if (!indicator || !indicator.classList.contains('CharacterIndicator')) return;
      var counter = indicator.querySelector('span');
      if (counter) inp.addEventListener('input', function () { counter.textContent = inp.value.length; });
    });

    // Vue
    if (window.Vue) {
      container.querySelectorAll('[vue-init]').forEach(function (el) {
        if (el.dataset.initialized) return;
        el.dataset.initialized = 'true';
        try { new Vue({ el: el, delimiters: ['${', '}'] }); } catch (e) {}
      });
    }

    // AdditionalVariant / birthstone
    container.querySelectorAll('.customLineProperty_VariantSelector').forEach(function (selectorEl) {
      initVariantSelector(selectorEl);
    });

    interceptAddToCart(container);
    watchButtonState(container);
  }

  // ── AdditionalVariant selector ────────────────────────────────
  function initVariantSelector(selectorEl) {
    var settings     = JSON.parse(selectorEl.getAttribute('data-custom-line-settings') || '{}');
    var selectorId   = settings.selector_id || '';
    var maxVariants  = (parseInt(settings.maxVariants) || 1) - 1;
    var currentIdx   = 0;
    var currentSecIdx = 0;
    var removeBtn    = selectorEl.querySelector('[data-action="remove-variant"]');
    var removeSecBtn = selectorEl.querySelector('[data-action="remove-secondary-variant"]');

    selectorEl.addEventListener('click', function (e) {
      var primary = e.target.closest('.AdditionalVariant:not(.SecondaryAdditionalVariant)');
      if (primary) {
        if (currentIdx > maxVariants) return;
        currentIdx++;
        fillSlot(selectorEl, selectorId + '_' + currentIdx, primary);
        if (removeBtn) removeBtn.classList.add('is-active');
        return;
      }
      var secondary = e.target.closest('.SecondaryAdditionalVariant');
      if (secondary) {
        if (currentSecIdx > maxVariants) return;
        currentSecIdx++;
        fillSlot(selectorEl, selectorId + '_' + currentSecIdx + '_secondary', secondary);
        if (removeSecBtn) removeSecBtn.classList.add('is-active');
      }
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        if (currentIdx <= 0) return;
        clearSlot(selectorEl, selectorId + '_' + currentIdx);
        currentIdx--;
        if (currentIdx <= 0) removeBtn.classList.remove('is-active');
      });
    }
    if (removeSecBtn) {
      removeSecBtn.addEventListener('click', function () {
        if (currentSecIdx <= 0) return;
        clearSlot(selectorEl, selectorId + '_' + currentSecIdx + '_secondary');
        currentSecIdx--;
        if (currentSecIdx <= 0) removeSecBtn.classList.remove('is-active');
      });
    }
  }

  function fillSlot(selectorEl, inputId, variantEl) {
    var variantId    = variantEl.getAttribute('data-variant-id');
    var variantTitle = variantEl.getAttribute('data-variant-title');
    var variantPrice = variantEl.getAttribute('data-variant-price') || '0';
    var imgEl  = variantEl.querySelector('img');
    var imgSrc = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
    var inputEl = selectorEl.querySelector('#' + inputId);
    var labelEl = selectorEl.querySelector('[for="' + inputId + '"]');
    if (!inputEl) return;
    inputEl.value = variantTitle;
    inputEl.setAttribute('value', variantTitle);
    inputEl.setAttribute('data-additional-fee-id', variantId);
    inputEl.setAttribute('data-additional-fee', variantPrice);
    inputEl.setAttribute('data-active', 'true');
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    if (labelEl && imgSrc) labelEl.style.backgroundImage = "url('" + imgSrc + "')";
  }

  function clearSlot(selectorEl, inputId) {
    var inputEl = selectorEl.querySelector('#' + inputId);
    var labelEl = selectorEl.querySelector('[for="' + inputId + '"]');
    if (inputEl) {
      inputEl.value = '';
      inputEl.removeAttribute('value');
      inputEl.removeAttribute('data-additional-fee-id');
      inputEl.removeAttribute('data-additional-fee');
      inputEl.removeAttribute('data-active');
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (labelEl) labelEl.style.backgroundImage = '';
  }

  // ── Image Slider ──────────────────────────────────────────────
  function initSlider(galleryWrap) {
    var sliderEl = galleryWrap.querySelector('.qv-slider');
    var slidesEl = galleryWrap.querySelector('.qv-slides');
    var slides   = galleryWrap.querySelectorAll('.qv-slide');
    var thumbs   = galleryWrap.querySelectorAll('.qv-thumb');
    var prevBtn  = galleryWrap.querySelector('.qv-arrow--prev');
    var nextBtn  = galleryWrap.querySelector('.qv-arrow--next');
    var total    = slides.length;
    var current  = 0;

    // Set pixel widths so translateX(-Npx) works correctly regardless of container
    function setWidths() {
      var w = sliderEl ? sliderEl.offsetWidth : 540;
      if (!w) w = 540; // fallback if not yet rendered
      slides.forEach(function(slide) { slide.style.width = w + 'px'; });
      slidesEl.style.width = (w * total) + 'px';
      // Re-apply current position with new width
      slidesEl.style.transform = 'translateX(-' + (current * w) + 'px)';
    }

    function goTo(idx) {
      current = (idx + total) % total;
      var w = sliderEl ? sliderEl.offsetWidth : 540;
      slidesEl.style.transform = 'translateX(-' + (current * w) + 'px)';
      thumbs.forEach(function(t, i) { t.classList.toggle('is-active', i === current); });
    }

    // Set widths immediately and also after a short delay (drawer animation)
    setWidths();
    setTimeout(setWidths, 400);

    // Re-calculate on resize
    window.addEventListener('resize', function() { setWidths(); });

    if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); goTo(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); goTo(current + 1); });
    thumbs.forEach(function(thumb, idx) { thumb.addEventListener('click', function() { goTo(idx); }); });

    if (sliderEl) {
      var startX = 0;
      sliderEl.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, { passive: true });
      sliderEl.addEventListener('touchend', function(e) {
        var diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) goTo(diff > 0 ? current + 1 : current - 1);
      });
    }
  }

  // ── Button state watcher ──────────────────────────────────────
  function watchButtonState(container) {
    var addBtn = container.querySelector('.ProductForm__AddToCart');
    if (!addBtn) return;

    function updateButtonState() {
      var unfilled = container.querySelectorAll('input[required]:not([value]):not([disabled])');
      if (unfilled.length === 0) {
        addBtn.removeAttribute('disabled');
        addBtn.setAttribute('data-action', 'add-to-cart');
        addBtn.className = addBtn.className.replace(/Button--secondary|Button--primary/g, '').trim();
        addBtn.classList.add('Button--primary');
        var addLabel = (window.languages && window.languages.productFormAddToCart) || 'Add to cart';
        addBtn.innerHTML = '<span>' + addLabel + '</span>';
      } else {
        var label = unfilled[0].getAttribute('data-custom-label') || 'required option';
        addBtn.setAttribute('disabled', 'disabled');
        addBtn.removeAttribute('data-action');
        addBtn.className = addBtn.className.replace(/Button--secondary|Button--primary/g, '').trim();
        addBtn.classList.add('Button--secondary');
        addBtn.innerHTML = 'Please select ' + label.toLowerCase();
      }
    }

    container.querySelectorAll('input[required]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (this.value) { this.setAttribute('value', this.value); this.setAttribute('data-active', 'true'); }
        else { this.removeAttribute('value'); this.removeAttribute('data-active'); }
        updateButtonState();
      });
    });

    updateButtonState();
  }

  // ── Add to cart ───────────────────────────────────────────────
  function interceptAddToCart(container) {
    var form   = container.querySelector('form[action*="/cart/add"]');
    var addBtn = container.querySelector('.ProductForm__AddToCart, [name="add"]');
    if (!form) return;

    function doAdd(e) {
      if (e) e.preventDefault();
      if (addBtn && addBtn.disabled) return;
      if (addBtn) addBtn.setAttribute('disabled', 'disabled');

      var variantInput = form.querySelector('[name="id"]');
      if (!variantInput) { if (addBtn) addBtn.removeAttribute('disabled'); return; }

      var properties = {};
      form.querySelectorAll('[name^="properties["]').forEach(function (inp) {
        var key = inp.getAttribute('name').replace('properties[', '').replace(']', '');
        var val = inp.value;
        if (!val) return;
        if (inp.type === 'date' && inp.getAttribute('name') !== 'properties[Send on]') {
          var d = new Date(val);
          if (!isNaN(d)) {
            val = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
          }
        }
        if (key) properties[key] = val;
      });

      var items = [];
      var additionalInputs = form.querySelectorAll('[data-additional-fee-id][data-active="true"]');
      var mainItem = {
        id: variantInput.value,
        quantity: parseInt((form.querySelector('[name="quantity"]') || {}).value || '1'),
        properties: properties,
        form_type: 'product',
        utf8: '✓'
      };

      if (additionalInputs.length) {
        var bundleId = Date.now();
        mainItem.properties['_bundleId'] = bundleId;
        additionalInputs.forEach(function (inp) {
          items.push({
            id: inp.getAttribute('data-additional-fee-id'),
            quantity: 1,
            properties: { _bundleId: bundleId, _bundleData: inp.getAttribute('name'), _bundleMerge: true },
            form_type: 'product', utf8: '✓'
          });
        });
      }

      items.push(mainItem);

      var cartUrl = (window.routes && window.routes.cartAddUrl) ? window.routes.cartAddUrl + '.js' : '/cart/add.js';

      fetch(cartUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ items: items.reverse() })
      })
      .then(function (r) { if (!r.ok) return r.json().then(function (e2) { throw e2; }); return r.json(); })
      .then(function () {
        if (addBtn) addBtn.removeAttribute('disabled');
        document.dispatchEvent(new CustomEvent('product:added', { bubbles: true, detail: { variant: { id: variantInput.value }, quantity: 1 } }));
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        setTimeout(closeDrawer, 400);
      })
      .catch(function (err) {
        if (addBtn) addBtn.removeAttribute('disabled');
        alert((err && err.description) || 'Could not add to cart. Please try again.');
        console.error('[QuickView] cart error:', err);
      });
    }

    form.addEventListener('submit', doAdd);
    if (addBtn) addBtn.addEventListener('click', doAdd);
    container.querySelectorAll('[data-action="add-to-cart"]').forEach(function (btn) { btn.addEventListener('click', doAdd); });
  }

  // ── Listeners ─────────────────────────────────────────────────
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeDrawer(); });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-qv-handle]');
    if (!btn) return;
    e.preventDefault();
    openDrawer(btn.getAttribute('data-qv-handle'), btn.getAttribute('data-qv-title') || '');
  });

  window.QuickView = { open: openDrawer, close: closeDrawer };

}); // DOMContentLoaded
/* ============================================================
   QUICK VIEW DRAWER — Prestage Theme
   File: assets/quick-view-drawer.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {

  // ── Build drawer DOM ────────────────────────────────────────
  var drawerHTML = '<div id="qv-drawer-overlay" aria-hidden="true"><div id="qv-drawer" role="dialog" aria-modal="true" aria-label="Quick View"><div id="qv-drawer-header"><button id="qv-drawer-close" type="button" aria-label="Close quick view"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M1 1l16 16M17 1L1 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><span id="qv-drawer-title"></span></div><div id="qv-drawer-body"><div id="qv-drawer-loading"><div class="qv-spinner"></div></div><div id="qv-drawer-content" style="display:none;"></div></div><div id="qv-drawer-footer"><a id="qv-full-link" href="#">View full product details</a></div></div></div>';

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
      .then(function(r) { return r.text(); })
      .then(function(html) { injectContent(html, handle); })
      .catch(function(err) {
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

  // ── Inject content ────────────────────────────────────────────
  function injectContent(html, handle) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(html, 'text/html');

    if (!titleEl.textContent.trim()) {
      var h1 = doc.querySelector('h1');
      if (h1) titleEl.textContent = h1.textContent.trim();
    }

    var imageSelectors = ['.Product__Gallery','.Product__Slideshow','.Product__Media','.product__media-wrapper','[data-product-gallery]'];
    var imageEl = null;
    for (var i = 0; i < imageSelectors.length; i++) {
      imageEl = doc.querySelector(imageSelectors[i]);
      if (imageEl) break;
    }

    var formSelectors = ['.Product__Info','.ProductMeta','.Product__Sidebar','.product__info-wrapper','[data-product-form]'];
    var formEl = null;
    for (var j = 0; j < formSelectors.length; j++) {
      formEl = doc.querySelector(formSelectors[j]);
      if (formEl) break;
    }
    if (!formEl) formEl = doc.querySelector('.Product') || doc.querySelector('main') || doc.body;

    content.innerHTML = '';

    // ── Build image slider from all slide items ───────────────
    var galleryEl = imageEl;
    var images = [];

    if (galleryEl) {
      // Collect all slide images from .Product__SlideItem elements
      var slideItems = galleryEl.querySelectorAll('.Product__SlideItem--image, .Product__SlideItem--featuredTagline');
      if (!slideItems.length) slideItems = galleryEl.querySelectorAll('.Product__SlideItem');

      slideItems.forEach(function(slide) {
        var img = slide.querySelector('img[data-src], img[src]');
        if (!img) return;
        var src = img.getAttribute('data-src') || img.getAttribute('src') || '';
        var widths = img.getAttribute('data-widths') || '';
        var resolved = resolveImgUrl(src, widths);
        if (resolved && resolved.indexOf('{width}') === -1) images.push(resolved);
      });

      // Fallback: grab any image with data-src
      if (!images.length) {
        galleryEl.querySelectorAll('img[data-src], img[src]').forEach(function(img) {
          var src = img.getAttribute('data-src') || img.getAttribute('src') || '';
          var resolved = resolveImgUrl(src, img.getAttribute('data-widths') || '');
          if (resolved && resolved.indexOf('{width}') === -1 && resolved.indexOf('cdn.shopify') !== -1) {
            images.push(resolved);
          }
        });
      }
    }

    // Build slider HTML
    var galleryWrap = document.createElement('div');
    galleryWrap.className = 'qv-gallery';

    if (images.length) {
      var sliderEl = document.createElement('div');
      sliderEl.className = 'qv-slider';

      // Slides track
      var slidesEl = document.createElement('div');
      slidesEl.className = 'qv-slides';

      images.forEach(function(src) {
        var slide = document.createElement('div');
        slide.className = 'qv-slide';
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        slide.appendChild(img);
        slidesEl.appendChild(slide);
      });
      sliderEl.appendChild(slidesEl);

      // Prev/Next arrows (only if multiple images)
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

      // Thumbnails
      if (images.length > 1) {
        var thumbsEl = document.createElement('div');
        thumbsEl.className = 'qv-thumbs';

        images.forEach(function(src, idx) {
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
      // No images found — show placeholder
      galleryWrap.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:13px;">No image</div>';
    }

    content.appendChild(galleryWrap);

    // Info column
    var infoWrap = document.createElement('div');
    infoWrap.className = 'qv-info';
    infoWrap.innerHTML = formEl ? formEl.innerHTML : '';
    content.appendChild(infoWrap);

    // Init slider behaviour
    if (images.length > 1) {
      initSlider(galleryWrap);
    }

    // Inject any inline styles from the fetched page
    doc.querySelectorAll('style').forEach(function(s) {
      var clone = document.createElement('style');
      clone.textContent = s.textContent;
      clone.setAttribute('data-qv-injected', '1');
      document.head.appendChild(clone);
    });

    // Fix lazy-load images — resolve {width} template
    var TARGET_WIDTH = 800;
    function resolveImgUrl(template, widthsAttr) {
      if (!template || template.indexOf('{width}') === -1) return template;
      var widths = [];
      try { widths = JSON.parse(widthsAttr || '[]'); } catch(e) {}
      var chosen = TARGET_WIDTH;
      if (widths.length) {
        var larger = widths.filter(function(w) { return w >= TARGET_WIDTH; });
        chosen = larger.length ? Math.min.apply(null, larger) : Math.max.apply(null, widths);
      }
      return template.replace('{width}', chosen);
    }

    content.querySelectorAll('img[data-src]').forEach(function(img) {
      img.src = resolveImgUrl(img.getAttribute('data-src'), img.getAttribute('data-widths'));
      img.removeAttribute('data-src');
      img.removeAttribute('data-widths');
      img.removeAttribute('data-sizes');
      img.classList.remove('Image--lazyLoad');
      img.classList.add('Image--fadeIn');
    });

    content.querySelectorAll('img').forEach(function(img) {
      var src = img.getAttribute('src') || '';
      if (src.indexOf('{width}') !== -1) {
        img.src = resolveImgUrl(src, img.getAttribute('data-widths') || '');
      }
    });

    // Fix relative links
    content.querySelectorAll('a[href]').forEach(function(a) {
      var href = a.getAttribute('href');
      if (href && href.charAt(0) === '/' && href.charAt(1) !== '/') {
        a.href = window.location.origin + href;
      }
    });

    // Re-init theme components
    reinitTheme(content, handle);

    loading.style.display = 'none';
    content.style.display = 'flex';
  }

  // ── Re-init theme ──────────────────────────────────────────────
  function reinitTheme(container, handle) {
    document.dispatchEvent(new CustomEvent('quickview:loaded', { bubbles: true, detail: { container: container, handle: handle } }));

    // data-action="open-drawer"
    container.querySelectorAll('[data-action="open-drawer"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var drawerId = this.getAttribute('data-drawer-id');
        document.dispatchEvent(new CustomEvent('drawer:open', { detail: { id: drawerId } }));
      });
    });

    // Popovers
    container.querySelectorAll('[aria-controls]').forEach(function(trigger) {
      var targetId = trigger.getAttribute('aria-controls');
      var target = container.querySelector('#' + targetId);
      if (!target) return;
      trigger.addEventListener('click', function() {
        var isExpanded = this.getAttribute('aria-expanded') === 'true';
        container.querySelectorAll('[aria-expanded="true"]').forEach(function(el) { el.setAttribute('aria-expanded', 'false'); });
        container.querySelectorAll('.Popover, .OptionSelector, .VariantSelector').forEach(function(el) { el.setAttribute('aria-hidden', 'true'); });
        if (!isExpanded) {
          trigger.setAttribute('aria-expanded', 'true');
          target.setAttribute('aria-hidden', 'false');
        }
      });
    });

    container.addEventListener('click', function(e) {
      if (!e.target.closest('[aria-controls]') && !e.target.closest('.Popover') && !e.target.closest('.OptionSelector')) {
        container.querySelectorAll('[aria-expanded="true"]').forEach(function(el) { el.setAttribute('aria-expanded', 'false'); });
        container.querySelectorAll('.Popover, .OptionSelector').forEach(function(el) { el.setAttribute('aria-hidden', 'true'); });
      }
    });

    // Select value in popover
    container.querySelectorAll('[data-action="select-value"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var position = this.getAttribute('data-option-position');
        var value    = this.getAttribute('data-value');
        var radio = container.querySelector('input[data-option-position="' + position + '"][value="' + value + '"]');
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        var wrapper2 = this.closest('.ProductForm__Option, .VariantSelector');
        if (wrapper2) wrapper2.querySelectorAll('.ProductForm__SelectedValue').forEach(function(el) { el.textContent = value; });
        var popover = this.closest('.Popover, .OptionSelector');
        if (popover) {
          popover.setAttribute('aria-hidden', 'true');
          var trig = container.querySelector('[aria-controls="' + popover.id + '"]');
          if (trig) trig.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Radio change → update label
    container.querySelectorAll('input[type="radio"][data-option-position]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var pos = this.getAttribute('data-option-position');
        container.querySelectorAll('.ProductForm__SelectedValue[data-option-position="' + pos + '"]').forEach(function(el) { el.textContent = radio.value; });
      });
    });

    // Toggle optional customisations — exact mirror of theme's _toggleContent
    container.querySelectorAll('[data-action="toggle-content"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var toggleId = this.getAttribute('data-toggle-id');
        var wrapper  = container.querySelector('.CustomLineProperties');
        var targetEl = container.querySelector('#' + toggleId);
        if (!wrapper || !targetEl) return;

        if (this.classList.contains('is-active')) {
          // Close — mirror _closeCustomProperties
          container.querySelectorAll('.CustomLineProperties_Item.is-active').forEach(function(el) { el.classList.remove('is-active'); });
          container.querySelectorAll('.CustomLineProperties > .is-active').forEach(function(el) { el.classList.remove('is-active'); });
          wrapper.style.height = '0px';
          wrapper.classList.remove('is-active');
        } else {
          // Open — mirror _toggleContent open branch
          container.querySelectorAll('.CustomLineProperties_Item.is-active').forEach(function(el) { el.classList.remove('is-active'); });
          this.classList.add('is-active');

          // clientHeight is 0 when hidden — briefly show to measure
          var prevVis = targetEl.style.visibility;
          var prevPos = targetEl.style.position;
          targetEl.style.visibility = 'hidden';
          targetEl.style.position = 'relative';
          targetEl.classList.add('is-active');
          var h = targetEl.scrollHeight || targetEl.clientHeight;
          targetEl.style.visibility = prevVis;
          targetEl.style.position = prevPos;

          wrapper.style.height = h + 'px';
          wrapper.classList.add('is-active');

          // Deactivate siblings, activate target
          wrapper.querySelectorAll('.customLineProperty--optional').forEach(function(el) {
            if (el !== targetEl) el.classList.remove('is-active');
          });
          targetEl.classList.add('is-active');
        }
      });
    });

    // CustomLineProperties_Close button
    container.querySelectorAll('.CustomLineProperties_Close').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var wrapper = container.querySelector('.CustomLineProperties');
        if (!wrapper) return;
        container.querySelectorAll('.CustomLineProperties_Item.is-active').forEach(function(el) { el.classList.remove('is-active'); });
        container.querySelectorAll('.CustomLineProperties > .is-active').forEach(function(el) { el.classList.remove('is-active'); });
        wrapper.style.height = '0px';
        wrapper.classList.remove('is-active');
      });
    });

    // Select variant (carousel)
    container.querySelectorAll('[data-action="select-variant"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var vs = this.closest('.VariantSelector');
        if (!vs) return;
        var selected = vs.querySelector('.VariantSelector__Item.is-selected');
        if (selected) {
          var pos = selected.getAttribute('data-option-position');
          var val = selected.getAttribute('data-option-value');
          var radio = container.querySelector('input[data-option-position="' + pos + '"][value="' + val + '"]');
          if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        vs.setAttribute('aria-hidden', 'true');
      });
    });

    container.querySelectorAll('.VariantSelector__Item').forEach(function(item) {
      item.addEventListener('click', function() {
        var carousel = this.closest('.VariantSelector__Carousel');
        if (carousel) carousel.querySelectorAll('.VariantSelector__Item').forEach(function(i) { i.classList.remove('is-selected'); });
        this.classList.add('is-selected');
      });
    });

    // Character counters
    container.querySelectorAll('textarea[maxlength], input[type="text"][maxlength]').forEach(function(input) {
      var indicator = input.nextElementSibling;
      if (!indicator || !indicator.classList.contains('CharacterIndicator')) return;
      var counter = indicator.querySelector('span');
      if (counter) input.addEventListener('input', function() { counter.textContent = input.value.length; });
    });

    // Vue / birthstone-selector
    if (window.Vue) {
      container.querySelectorAll('[vue-init]').forEach(function(el) {
        if (el.dataset.initialized) return;
        el.dataset.initialized = 'true';
        try { new Vue({ el: el, delimiters: ['${', '}'] }); } catch(e) {}
      });
    }

    // AdditionalVariant (birthstone) clicks
    container.querySelectorAll('.customLineProperty_VariantSelector').forEach(function(selectorEl) {
      initVariantSelector(selectorEl);
    });

    // Add to cart
    interceptAddToCart(container);

    // Button state watcher — mirrors theme's _validateRequiredField logic:
    // Checks input[required]:not([value]) and updates the Add to Cart button text
    watchButtonState(container);
  }

  // ── AdditionalVariant selector ────────────────────────────────
  function initVariantSelector(selectorEl) {
    var settings    = JSON.parse(selectorEl.getAttribute('data-custom-line-settings') || '{}');
    var selectorId  = settings.selector_id || '';
    var maxVariants = (parseInt(settings.maxVariants) || 1) - 1;
    var currentIdx  = 0;
    var currentSecIdx = 0;

    var removeBtn    = selectorEl.querySelector('[data-action="remove-variant"]');
    var removeSecBtn = selectorEl.querySelector('[data-action="remove-secondary-variant"]');

    selectorEl.addEventListener('click', function(e) {
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
      removeBtn.addEventListener('click', function() {
        if (currentIdx <= 0) return;
        clearSlot(selectorEl, selectorId + '_' + currentIdx);
        currentIdx--;
        if (currentIdx <= 0) removeBtn.classList.remove('is-active');
      });
    }

    if (removeSecBtn) {
      removeSecBtn.addEventListener('click', function() {
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
    var imgEl = variantEl.querySelector('img');
    var imgSrc = imgEl ? (imgEl.currentSrc || imgEl.src) : '';
    var inputEl = selectorEl.querySelector('#' + inputId);
    var labelEl = selectorEl.querySelector('[for="' + inputId + '"]');
    if (!inputEl) return;
    inputEl.value = variantTitle;
    // CRITICAL: theme checks the VALUE ATTRIBUTE (not property) via input[required]:not([value])
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
      inputEl.removeAttribute('value');      // theme checks attribute
      inputEl.removeAttribute('data-additional-fee-id');
      inputEl.removeAttribute('data-additional-fee');
      inputEl.removeAttribute('data-active');
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (labelEl) labelEl.style.backgroundImage = '';
  }


  // ── Image Slider ─────────────────────────────────────────────
  function initSlider(galleryWrap) {
    var slidesEl   = galleryWrap.querySelector('.qv-slides');
    var thumbs     = galleryWrap.querySelectorAll('.qv-thumb');
    var prevBtn    = galleryWrap.querySelector('.qv-arrow--prev');
    var nextBtn    = galleryWrap.querySelector('.qv-arrow--next');
    var total      = thumbs.length;
    var current    = 0;

    function goTo(idx) {
      current = (idx + total) % total;
      slidesEl.style.transform = 'translateX(-' + (current * 100) + '%)';
      thumbs.forEach(function(t, i) {
        t.classList.toggle('is-active', i === current);
      });
    }

    if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); goTo(current - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); goTo(current + 1); });

    thumbs.forEach(function(thumb, idx) {
      thumb.addEventListener('click', function() { goTo(idx); });
    });

    // Touch/swipe support
    var startX = 0;
    var sliderEl = galleryWrap.querySelector('.qv-slider');
    if (sliderEl) {
      sliderEl.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, { passive: true });
      sliderEl.addEventListener('touchend', function(e) {
        var diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) goTo(diff > 0 ? current + 1 : current - 1);
      });
    }
  }

  // ── Button state: "Please select X" → "Add to cart" ──────────
  // The theme's _validateRequiredField sets/removes the value ATTRIBUTE
  // on required inputs and then calls _updateAddToCartButton.
  // We mirror this by listening for change on required inputs inside the drawer.
  function watchButtonState(container) {
    var addBtn = container.querySelector('.ProductForm__AddToCart');
    if (!addBtn) return;

    function updateButtonState() {
      // Same selector the theme uses: required inputs with no value attribute
      var unfilled = container.querySelectorAll('input[required]:not([value]):not([disabled])');

      if (unfilled.length === 0) {
        // All required fields filled — show Add to cart
        var usePrimary = addBtn.getAttribute('data-use-primary-button') === 'true';
        addBtn.removeAttribute('disabled');
        addBtn.setAttribute('data-action', 'add-to-cart');
        addBtn.className = addBtn.className.replace(/Button--secondary|Button--primary/g, '').trim();
        addBtn.classList.add(usePrimary ? 'Button--primary' : 'Button--primary');
        // Use theme language string if available, else fallback
        var addLabel = (window.languages && window.languages.productFormAddToCart) || 'Add to cart';
        addBtn.innerHTML = '<span>' + addLabel + '</span>';
      } else {
        // Still unfilled — show "Please select X"
        var label = unfilled[0].getAttribute('data-custom-label') || 'required option';
        var usePrimary2 = addBtn.getAttribute('data-use-primary-button') === 'true';
        addBtn.setAttribute('disabled', 'disabled');
        addBtn.removeAttribute('data-action');
        addBtn.className = addBtn.className.replace(/Button--secondary|Button--primary/g, '').trim();
        addBtn.classList.add(usePrimary2 ? 'Button--primary' : 'Button--secondary');
        addBtn.innerHTML = 'Please select ' + label.toLowerCase();
      }
    }

    // Listen for change on all required inputs in the drawer
    container.querySelectorAll('input[required]').forEach(function(inp) {
      inp.addEventListener('change', function() {
        // Mirror theme: set or remove value attribute based on input value
        if (this.value && this.value !== '') {
          this.setAttribute('value', this.value);
          this.setAttribute('data-active', 'true');
        } else {
          this.removeAttribute('value');
          this.removeAttribute('data-active');
        }
        updateButtonState();
      });
    });

    // Run once on load to set initial state
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
      form.querySelectorAll('[name^="properties["]').forEach(function(inp) {
        var key = inp.getAttribute('name').replace('properties[', '').replace(']', '');
        var val = inp.value;
        if (!val) return;
        if (inp.type === 'date' && inp.getAttribute('name') !== 'properties[Send on]') {
          var d = new Date(val);
          if (!isNaN(d)) {
            val = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
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
        additionalInputs.forEach(function(inp) {
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
      .then(function(r) { if (!r.ok) return r.json().then(function(e) { throw e; }); return r.json(); })
      .then(function() {
        if (addBtn) addBtn.removeAttribute('disabled');
        document.dispatchEvent(new CustomEvent('product:added', {
          bubbles: true,
          detail: { variant: { id: variantInput.value }, quantity: 1 }
        }));
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        setTimeout(closeDrawer, 400);
      })
      .catch(function(err) {
        if (addBtn) addBtn.removeAttribute('disabled');
        alert((err && err.description) || 'Could not add to cart. Please try again.');
        console.error('[QuickView] cart error:', err);
      });
    }

    form.addEventListener('submit', doAdd);
    if (addBtn) addBtn.addEventListener('click', doAdd);
    container.querySelectorAll('[data-action="add-to-cart"]').forEach(function(btn) {
      btn.addEventListener('click', doAdd);
    });
  }

  // ── Event listeners ───────────────────────────────────────────
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeDrawer(); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && isOpen) closeDrawer(); });

  // ── Bind trigger buttons ──────────────────────────────────────
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-qv-handle]');
    if (!btn) return;
    e.preventDefault();
    openDrawer(btn.getAttribute('data-qv-handle'), btn.getAttribute('data-qv-title') || '');
  });

  window.QuickView = { open: openDrawer, close: closeDrawer };

}); // DOMContentLoaded
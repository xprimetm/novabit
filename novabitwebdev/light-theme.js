(function () {
    const root = document.documentElement;
    const desktopQuery = window.matchMedia('(min-width: 768px)');
    const smartsuppConfig = {
        key: '62959fe5361bc914a90f19c466cbfe13856a37be',
    };

    const navbarConfig = {
        brand: {
            href: 'index.html',
            logo: 'temp/custom/img/novabit-logo-wordmark.png',
            alt: 'Novabit Capital',
        },
        priorityLink: null,
        groups: [
            {
                label: 'Markets',
                items: [
                    { href: 'cryptocurrencies.html', label: 'Crypto Assets' },
                    { href: 'forex.html', label: 'Macro Markets' },
                    { href: 'shares.html', label: 'Stocks' },
                    { href: 'indices.html', label: 'Indices' },
                    { href: 'etfs.html', label: 'ETFs' },
                ],
            },
            {
                label: 'Strategies',
                items: [
                    { href: 'trade.html', label: 'Portfolio Tools' },
                    { href: 'copy.html', label: 'Model Portfolios' },
                    { href: 'automate.html', label: 'Recurring Investing' },
                ],
            },
            {
                label: 'Company',
                items: [
                    { href: 'about.html', label: 'About Us' },
                    { href: 'why-us.html', label: 'Why Us' },
                    { href: 'faq.html', label: 'FAQ' },
                    { href: 'regulation.html', label: 'Legal & Regulation' },
                ],
            },
        ],
        links: [
            { href: 'plans.html', label: 'Plans' },
            { href: 'for-traders.html', label: 'Investor Education' },
            { href: 'contacts.html', label: 'Contact', aliases: ['contact.html'] },
        ],
        actions: [
            { href: 'login.html', label: 'Log in', kind: 'secondary' },
            { href: 'register.html', label: 'Sign up', kind: 'primary' },
        ],
    };

    function getCurrentPage() {
        const pathname = (window.location.pathname || '').replace(/\\/g, '/');
        const file = pathname.split('/').pop();
        return file && file.length > 0 ? file : 'index.html';
    }

    function isItemActive(item, currentPage) {
        if (currentPage === item.href) {
            return true;
        }

        if (Array.isArray(item.aliases) && item.aliases.includes(currentPage)) {
            return true;
        }

        return false;
    }

    function isGroupActive(group, currentPage) {
        return group.items.some((item) => isItemActive(item, currentPage));
    }

    function chevronIcon() {
        return [
            '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">',
            '<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"></path>',
            '</svg>',
        ].join('');
    }

    function hamburgerIcon() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">',
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16M4 12h16M4 17h16"></path>',
            '</svg>',
        ].join('');
    }

    function closeIcon() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">',
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18"></path>',
            '</svg>',
        ].join('');
    }

    function renderDesktopGroup(group, currentPage, index) {
        const active = isGroupActive(group, currentPage);
        const menuId = `apple-navbar-menu-${index + 1}`;

        return [
            `<div class="apple-nav-group${active ? ' is-active' : ''}" data-apple-group>`,
            `<button class="apple-nav-trigger${active ? ' apple-is-active' : ''}" type="button" data-apple-trigger aria-expanded="false" aria-controls="${menuId}" aria-haspopup="true">`,
            `<span>${group.label}</span>`,
            `<span class="apple-nav-trigger-icon">${chevronIcon()}</span>`,
            '</button>',
            `<div class="apple-nav-dropdown" id="${menuId}" data-apple-menu hidden>`,
            group.items
                .map((item) => {
                    const activeItem = isItemActive(item, currentPage);
                    return `<a href="${item.href}" class="apple-nav-dropdown-link${activeItem ? ' apple-is-active' : ''}"${activeItem ? ' aria-current="page"' : ''}>${item.label}</a>`;
                })
                .join(''),
            '</div>',
            '</div>',
        ].join('');
    }

    function renderDesktopLink(item, currentPage) {
        const active = isItemActive(item, currentPage);
        return `<a href="${item.href}" class="apple-nav-link${active ? ' apple-is-active' : ''}"${active ? ' aria-current="page"' : ''}>${item.label}</a>`;
    }

    function renderAction(action, currentPage) {
        const active = isItemActive(action, currentPage);
        return `<a href="${action.href}" class="apple-nav-action apple-nav-action--${action.kind}${active ? ' apple-is-active' : ''}"${active ? ' aria-current="page"' : ''}>${action.label}</a>`;
    }

    function renderMobileLink(item, currentPage, className = 'apple-mobile-link') {
        const active = isItemActive(item, currentPage);
        return `<a href="${item.href}" class="${className}${active ? ' apple-is-active' : ''}"${active ? ' aria-current="page"' : ''}>${item.label}</a>`;
    }

    function renderMobileGroup(group, currentPage, index) {
        const active = isGroupActive(group, currentPage);
        const menuId = `apple-mobile-menu-${index + 1}`;

        return [
            `<div class="apple-mobile-group" data-apple-mobile-group>`,
            `<button class="apple-mobile-group-trigger${active ? ' apple-is-active' : ''}" type="button" data-apple-mobile-trigger aria-expanded="${active ? 'true' : 'false'}" aria-controls="${menuId}">`,
            `<span>${group.label}</span>`,
            `<span class="apple-mobile-group-icon">${chevronIcon()}</span>`,
            '</button>',
            `<div class="apple-mobile-submenu" id="${menuId}" data-apple-mobile-menu${active ? '' : ' hidden'}>`,
            group.items
                .map((item) => {
                    const activeItem = isItemActive(item, currentPage);
                    return `<a href="${item.href}" class="apple-mobile-submenu-link${activeItem ? ' apple-is-active' : ''}"${activeItem ? ' aria-current="page"' : ''}>${item.label}</a>`;
                })
                .join(''),
            '</div>',
            '</div>',
        ].join('');
    }

    function buildNavbarMarkup() {
        const currentPage = getCurrentPage();
        const priorityDesktopLink = navbarConfig.priorityLink ? renderDesktopLink(navbarConfig.priorityLink, currentPage) : '';
        const priorityMobileLink = navbarConfig.priorityLink
            ? renderMobileLink(navbarConfig.priorityLink, currentPage, 'apple-navbar__mobile-invest')
            : '';
        const desktopPrimaryLinks = navbarConfig.links
            .map((item) => renderDesktopLink(item, currentPage))
            .join('');

        return [
            '<header class="apple-navbar" data-apple-navbar>',
            '<div class="apple-navbar__inner">',
            '<div class="apple-navbar__bar">',
            `<a href="${navbarConfig.brand.href}" class="apple-navbar__brand" aria-label="${navbarConfig.brand.alt}">`,
            `<img src="${navbarConfig.brand.logo}" alt="${navbarConfig.brand.alt}">`,
            '</a>',
            '<nav class="apple-navbar__desktop" aria-label="Primary navigation">',
            '<div class="apple-navbar__desktop-primary">',
            navbarConfig.groups.map((group, index) => renderDesktopGroup(group, currentPage, index)).join(''),
            priorityDesktopLink,
            desktopPrimaryLinks,
            '</div>',
            '</nav>',
            '<div class="apple-navbar__actions">',
            navbarConfig.actions.map((action) => renderAction(action, currentPage)).join(''),
            '</div>',
            priorityMobileLink,
            '<div id="gtranslate_header_slot" class="apple-navbar__translate-slot" aria-label="Language selector"></div>',
            '<button class="apple-navbar__mobile-toggle" type="button" data-apple-mobile-toggle aria-expanded="false" aria-controls="apple-mobile-panel" aria-label="Open navigation menu">',
            '<span class="apple-navbar__mobile-toggle-open">',
            hamburgerIcon(),
            '</span>',
            '<span class="apple-navbar__mobile-toggle-close">',
            closeIcon(),
            '</span>',
            '</button>',
            '</div>',
            '<div class="apple-mobile-panel" id="apple-mobile-panel" data-apple-mobile-panel hidden>',
            '<div class="apple-mobile-panel__surface">',
            navbarConfig.groups.map((group, index) => renderMobileGroup(group, currentPage, index)).join(''),
            navbarConfig.links
                .map((item) => renderMobileLink(item, currentPage))
                .join(''),
            '<div class="apple-mobile-actions">',
            navbarConfig.actions
                .map((action) => {
                    const active = isItemActive(action, currentPage);
                    return `<a href="${action.href}" class="apple-mobile-action apple-mobile-action--${action.kind}${active ? ' apple-is-active' : ''}"${active ? ' aria-current="page"' : ''}>${action.label}</a>`;
                })
                .join(''),
            '</div>',
            '</div>',
            '</div>',
            '</div>',
            '</header>',
        ].join('');
    }

    function applyLightTheme() {
        root.classList.remove('dark');
        root.classList.add('light');

        if (document.body) {
            document.body.classList.remove('dark', 'bg-gray-900', 'bg-gray-300', 'bg-slate-950', 'text-slate-100');
            document.body.classList.add('light');
            if (!document.body.classList.contains('bg-gray-50')) {
                document.body.classList.add('bg-gray-50');
            }
            if (!document.body.classList.contains('text-gray-900')) {
                document.body.classList.add('text-gray-900');
            }
        }

        document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
            meta.setAttribute('content', '#f8fafc');
        });

        document.querySelectorAll('iframe[src*="theme=dark"]').forEach((frame) => {
            frame.src = frame.src.replace(/theme=dark/g, 'theme=light');
        });
    }

    function rebuildNavbar() {
        const existingHeader = document.querySelector('header');

        if (!existingHeader) {
            return;
        }

        if (existingHeader.hasAttribute('data-apple-navbar')) {
            return;
        }

        const template = document.createElement('template');
        template.innerHTML = buildNavbarMarkup().trim();
        const nextHeader = template.content.firstElementChild;

        if (!nextHeader) {
            return;
        }

        existingHeader.replaceWith(nextHeader);
    }

    function initSmartsupp() {
        const overrideKey = typeof window.NOVABIT_SMARTSUPP_KEY === 'string'
            ? window.NOVABIT_SMARTSUPP_KEY.trim()
            : '';
        const key = overrideKey || String(smartsuppConfig.key || '').trim();

        if (!key || /YOUR_SMARTSUPP_CHAT_CODE/i.test(key)) {
            return;
        }

        window._smartsupp = window._smartsupp || {};
        window._smartsupp.key = key;

        if (document.querySelector('script[data-smartsupp-loader="true"]')) {
            return;
        }

        if (!window.smartsupp) {
            window.smartsupp = function () {
                window.smartsupp._.push(arguments);
            };
            window.smartsupp._ = [];
        }

        const firstScript = document.getElementsByTagName('script')[0];
        const loader = document.createElement('script');
        loader.type = 'text/javascript';
        loader.charset = 'utf-8';
        loader.async = true;
        loader.src = 'https://www.smartsuppchat.com/loader.js';
        loader.setAttribute('data-smartsupp-loader', 'true');

        if (firstScript && firstScript.parentNode) {
            firstScript.parentNode.insertBefore(loader, firstScript);
        } else if (document.head) {
            document.head.appendChild(loader);
        }

        if (!document.querySelector('[data-smartsupp-noscript="true"]') && document.body) {
            const fallback = document.createElement('noscript');
            fallback.setAttribute('data-smartsupp-noscript', 'true');
            fallback.innerHTML = 'Powered by <a href="https://www.smartsupp.com" target="_blank" rel="noopener noreferrer">Smartsupp</a>';
            document.body.appendChild(fallback);
        }
    }

    function readStoredBitcoinSnapshot() {
        try {
            const raw = localStorage.getItem('nova-btc-snapshot');

            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);

            if (!Array.isArray(parsed.points) || parsed.points.length < 2) {
                return null;
            }

            return parsed;
        } catch (error) {
            return null;
        }
    }

    function storeBitcoinSnapshot(snapshot) {
        try {
            localStorage.setItem('nova-btc-snapshot', JSON.stringify(snapshot));
        } catch (error) {
            // Ignore storage failures and still render the widget.
        }
    }

    function formatUsd(value, maximumFractionDigits = 0) {
        if (!Number.isFinite(value)) {
            return 'Unavailable';
        }

        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits,
        }).format(value);
    }

    function formatCompactUsd(value) {
        if (!Number.isFinite(value)) {
            return 'Unavailable';
        }

        return '$' + new Intl.NumberFormat('en-US', {
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(value);
    }

    function formatPercent(value) {
        if (!Number.isFinite(value)) {
            return 'Reference view';
        }

        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    }

    function formatTimestamp(value) {
        if (!value) {
            return 'Reference market view';
        }

        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(value));
    }

    function buildSparkline(points, width, height, padding) {
        if (!Array.isArray(points) || points.length < 2) {
            return { line: '', area: '' };
        }

        const min = Math.min(...points);
        const max = Math.max(...points);
        const range = max - min || 1;
        const usableWidth = width - padding * 2;
        const usableHeight = height - padding * 2;
        const stepX = usableWidth / Math.max(points.length - 1, 1);

        const coords = points.map((point, index) => {
            const x = padding + stepX * index;
            const normalized = (point - min) / range;
            const y = height - padding - normalized * usableHeight;
            return [Number(x.toFixed(2)), Number(y.toFixed(2))];
        });

        const line = coords
            .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
            .join(' ');
        const baseline = height - padding;
        const area = `${line} L ${coords[coords.length - 1][0]} ${baseline} L ${coords[0][0]} ${baseline} Z`;

        return { line, area };
    }

    function renderBitcoinWidget(widget, snapshot) {
        const price = widget.querySelector('[data-btc-price]');
        const change = widget.querySelector('[data-btc-change]');
        const marketCap = widget.querySelector('[data-btc-market-cap]');
        const volume = widget.querySelector('[data-btc-volume]');
        const focus = widget.querySelector('[data-btc-focus]');
        const source = widget.querySelector('[data-btc-source]');
        const updated = widget.querySelector('[data-btc-updated]');
        const note = widget.querySelector('[data-btc-note]');
        const range = widget.querySelector('[data-btc-range]');
        const line = widget.querySelector('[data-btc-line]');
        const area = widget.querySelector('[data-btc-area]');

        price.textContent = Number.isFinite(snapshot.price)
            ? formatUsd(snapshot.price, snapshot.price >= 1000 ? 0 : 2)
            : 'Live feed unavailable';

        change.classList.remove('is-positive', 'is-negative');
        if (Number.isFinite(snapshot.change24h)) {
            change.textContent = `${formatPercent(snapshot.change24h)} in 24h`;
            change.classList.add(snapshot.change24h >= 0 ? 'is-positive' : 'is-negative');
        } else {
            change.textContent = 'Reference market view';
        }

        marketCap.textContent = Number.isFinite(snapshot.marketCap)
            ? formatCompactUsd(snapshot.marketCap)
            : 'Awaiting live feed';
        volume.textContent = Number.isFinite(snapshot.volume24h)
            ? formatCompactUsd(snapshot.volume24h)
            : 'Refresh to update';
        focus.textContent = snapshot.focus;
        source.textContent = snapshot.sourceLabel;
        source.classList.remove('is-live', 'is-cached', 'is-fallback');
        source.classList.add(snapshot.sourceClass);
        updated.textContent = snapshot.updatedLabel;
        note.textContent = snapshot.note;
        range.textContent = snapshot.rangeLabel;

        const { line: linePath, area: areaPath } = buildSparkline(snapshot.points, 640, 220, 16);
        line.setAttribute('d', linePath);
        area.setAttribute('d', areaPath);
    }

    function createFallbackBitcoinSnapshot(storedSnapshot = null) {
        if (storedSnapshot) {
            return {
                ...storedSnapshot,
                sourceLabel: 'Saved snapshot',
                sourceClass: 'is-cached',
                updatedLabel: `Saved ${formatTimestamp(storedSnapshot.updatedAt)}`,
                rangeLabel: Number.isFinite(storedSnapshot.low7d) && Number.isFinite(storedSnapshot.high7d)
                    ? `${formatUsd(storedSnapshot.low7d)} to ${formatUsd(storedSnapshot.high7d)}`
                    : 'Recent trend reference',
                focus: 'Liquidity, trend and volatility',
                note: 'Showing the latest saved Bitcoin snapshot while the live feed reconnects.',
            };
        }

        return {
            price: null,
            change24h: null,
            marketCap: null,
            volume24h: null,
            low7d: null,
            high7d: null,
            points: [61200, 61840, 62410, 62150, 63520, 64160, 63880],
            updatedAt: null,
            sourceLabel: 'Reference view',
            sourceClass: 'is-fallback',
            updatedLabel: 'Live market feed unavailable',
            rangeLabel: 'Trend reference only',
            focus: 'Liquidity, trend and volatility',
            note: 'Live Bitcoin data could not be loaded right now, so this section falls back to a local research view instead of hanging on a spinner.',
        };
    }

    async function fetchBitcoinSnapshot() {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=true',
            {
                headers: {
                    accept: 'application/json',
                },
            },
        );

        if (!response.ok) {
            throw new Error(`Bitcoin snapshot request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const marketData = payload && payload.market_data ? payload.market_data : null;
        const points = Array.isArray(marketData && marketData.sparkline_7d && marketData.sparkline_7d.price)
            ? marketData.sparkline_7d.price.map(Number).filter(Number.isFinite)
            : [];

        if (!marketData || points.length < 2) {
            throw new Error('Bitcoin snapshot response is incomplete');
        }

        const low7d = Math.min(...points);
        const high7d = Math.max(...points);

        return {
            price: Number(marketData.current_price.usd),
            change24h: Number(marketData.price_change_percentage_24h_in_currency.usd),
            marketCap: Number(marketData.market_cap.usd),
            volume24h: Number(marketData.total_volume.usd),
            low7d,
            high7d,
            points,
            updatedAt: Date.now(),
            sourceLabel: 'Live data',
            sourceClass: 'is-live',
            updatedLabel: `Updated ${formatTimestamp(Date.now())}`,
            rangeLabel: `${formatUsd(low7d)} to ${formatUsd(high7d)}`,
            focus: 'Liquidity, trend and volatility',
            note: 'Bitcoin acts as the market reference asset for crypto liquidity, sentiment and allocation timing.',
        };
    }

    function initBitcoinWidget() {
        const widget = document.querySelector('[data-btc-widget]');

        if (!widget) {
            return;
        }

        const storedSnapshot = readStoredBitcoinSnapshot();
        renderBitcoinWidget(widget, createFallbackBitcoinSnapshot(storedSnapshot));

        if (widget.dataset.loading === 'true') {
            return;
        }

        widget.dataset.loading = 'true';

        fetchBitcoinSnapshot()
            .then((snapshot) => {
                storeBitcoinSnapshot(snapshot);
                renderBitcoinWidget(widget, snapshot);
            })
            .catch(() => {
                renderBitcoinWidget(widget, createFallbackBitcoinSnapshot(readStoredBitcoinSnapshot()));
            })
            .finally(() => {
                widget.dataset.loading = 'false';
            });
    }

    function initTranslateSlot() {
        const wrappers = Array.from(document.querySelectorAll('.gtranslate_wrapper'));

        if (wrappers.length === 0) {
            return;
        }

        const primaryWrapper = wrappers[0];
        wrappers.slice(1).forEach((wrapper) => wrapper.remove());

        primaryWrapper.classList.remove('nova-translate-slot--floating');

        const headerSlot = document.getElementById('gtranslate_header_slot');
        if (headerSlot) {
            headerSlot.appendChild(primaryWrapper);
            return;
        }

        if (primaryWrapper.parentElement !== document.body) {
            document.body.appendChild(primaryWrapper);
        }

        primaryWrapper.classList.add('nova-translate-slot--floating');
    }

    function setDesktopGroupState(group, isOpen) {
        const trigger = group.querySelector('[data-apple-trigger]');
        const menu = group.querySelector('[data-apple-menu]');

        if (!trigger || !menu) {
            return;
        }

        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        group.dataset.open = isOpen ? 'true' : 'false';

        if (isOpen) {
            menu.removeAttribute('hidden');
        } else {
            menu.setAttribute('hidden', '');
        }
    }

    function closeDesktopGroups(navbar, except) {
        navbar.querySelectorAll('[data-apple-group]').forEach((group) => {
            if (group === except) {
                return;
            }

            setDesktopGroupState(group, false);
        });
    }

    function setMobilePanelState(navbar, isOpen) {
        const toggle = navbar.querySelector('[data-apple-mobile-toggle]');
        const panel = navbar.querySelector('[data-apple-mobile-panel]');

        if (!toggle || !panel) {
            return;
        }

        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        navbar.dataset.mobileOpen = isOpen ? 'true' : 'false';

        if (isOpen) {
            panel.removeAttribute('hidden');
        } else {
            panel.setAttribute('hidden', '');
        }
    }

    function setMobileGroupState(group, isOpen) {
        const trigger = group.querySelector('[data-apple-mobile-trigger]');
        const menu = group.querySelector('[data-apple-mobile-menu]');

        if (!trigger || !menu) {
            return;
        }

        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        group.dataset.open = isOpen ? 'true' : 'false';

        if (isOpen) {
            menu.removeAttribute('hidden');
        } else {
            menu.setAttribute('hidden', '');
        }
    }

    function initNavbar() {
        const navbar = document.querySelector('[data-apple-navbar]');

        if (!navbar || navbar.dataset.bound === 'true') {
            return;
        }

        navbar.querySelectorAll('[data-apple-group]').forEach((group) => {
            const trigger = group.querySelector('[data-apple-trigger]');
            const menu = group.querySelector('[data-apple-menu]');
            let closeTimer = null;

            function clearCloseTimer() {
                if (closeTimer !== null) {
                    window.clearTimeout(closeTimer);
                    closeTimer = null;
                }
            }

            function scheduleClose() {
                clearCloseTimer();
                closeTimer = window.setTimeout(() => {
                    setDesktopGroupState(group, false);
                    closeTimer = null;
                }, 180);
            }

            setDesktopGroupState(group, false);

            trigger.addEventListener('click', (event) => {
                event.preventDefault();
                clearCloseTimer();
                const nextState = trigger.getAttribute('aria-expanded') !== 'true';
                closeDesktopGroups(navbar, nextState ? group : null);
                setDesktopGroupState(group, nextState);
            });

            group.addEventListener('mouseenter', () => {
                if (!desktopQuery.matches) {
                    return;
                }

                clearCloseTimer();
                closeDesktopGroups(navbar, group);
                setDesktopGroupState(group, true);
            });

            group.addEventListener('mouseleave', () => {
                if (!desktopQuery.matches) {
                    return;
                }

                scheduleClose();
            });

            group.addEventListener('focusin', () => {
                clearCloseTimer();
                closeDesktopGroups(navbar, group);
                setDesktopGroupState(group, true);
            });

            if (menu) {
                menu.addEventListener('mouseenter', clearCloseTimer);
                menu.addEventListener('mouseleave', () => {
                    if (!desktopQuery.matches) {
                        return;
                    }

                    scheduleClose();
                });
            }
        });

        const mobileToggle = navbar.querySelector('[data-apple-mobile-toggle]');
        const mobilePanel = navbar.querySelector('[data-apple-mobile-panel]');

        if (mobileToggle && mobilePanel) {
            setMobilePanelState(navbar, false);

            mobileToggle.addEventListener('click', () => {
                const nextState = mobileToggle.getAttribute('aria-expanded') !== 'true';
                setMobilePanelState(navbar, nextState);
                closeDesktopGroups(navbar);
            });
        }

        navbar.querySelectorAll('[data-apple-mobile-group]').forEach((group) => {
            const trigger = group.querySelector('[data-apple-mobile-trigger]');
            const menu = group.querySelector('[data-apple-mobile-menu]');
            const shouldStartOpen = trigger.getAttribute('aria-expanded') === 'true';

            if (!menu) {
                return;
            }

            setMobileGroupState(group, shouldStartOpen);

            trigger.addEventListener('click', (event) => {
                event.preventDefault();

                const nextState = trigger.getAttribute('aria-expanded') !== 'true';

                navbar.querySelectorAll('[data-apple-mobile-group]').forEach((otherGroup) => {
                    if (otherGroup === group) {
                        return;
                    }

                    setMobileGroupState(otherGroup, false);
                });

                setMobileGroupState(group, nextState);
            });
        });

        navbar.querySelectorAll('[data-apple-mobile-panel] a').forEach((link) => {
            link.addEventListener('click', () => {
                setMobilePanelState(navbar, false);
            });
        });

        document.addEventListener('click', (event) => {
            if (!navbar.contains(event.target)) {
                closeDesktopGroups(navbar);
                setMobilePanelState(navbar, false);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeDesktopGroups(navbar);
                setMobilePanelState(navbar, false);
            }
        });

        window.addEventListener('resize', () => {
            if (desktopQuery.matches) {
                setMobilePanelState(navbar, false);
            }

            closeDesktopGroups(navbar);
        });

        navbar.dataset.bound = 'true';
    }

    try {
        localStorage.setItem('theme', 'light');
        localStorage.setItem('darkMode', 'light');
    } catch (error) {
        // Ignore storage failures and still force the visual light theme.
    }

    function boot() {
        applyLightTheme();
        rebuildNavbar();
        initNavbar();
        initSmartsupp();
        initTranslateSlot();
        initBitcoinWidget();
    }

    boot();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    }

    window.addEventListener('pageshow', boot);
})();

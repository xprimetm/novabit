(function () {
    const api = (!window.location || window.location.protocol === "file:")
        ? "http://localhost:4000/api/v1"
        : window.location.origin.replace(/\/+$/, "") + "/api/v1";
    const gate = document.getElementById("gate");
    const shell = document.getElementById("shell");
    const loginForm = document.getElementById("login-form");
    const loginId = document.getElementById("login-id");
    const loginPass = document.getElementById("login-pass");
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const refreshBtn = document.getElementById("refresh-btn");
    const sidebarRefreshButtons = Array.from(document.querySelectorAll("[data-sidebar-refresh]"));
    const openCreateButtons = Array.from(document.querySelectorAll("[data-open-coupon-modal]"));
    const modal = document.getElementById("coupon-modal");
    const modalClose = document.getElementById("coupon-modal-close");
    const modalCancel = document.getElementById("coupon-modal-cancel");
    const createForm = document.getElementById("coupon-form");
    const createSubmit = document.getElementById("coupon-submit-btn");
    const createStatus = document.getElementById("coupon-create-status");
    const createNameInput = createForm ? createForm.querySelector('input[name="celebrity_name"]') : null;
    const couponCodeInput = document.getElementById("coupon-code");
    const couponExpiryDateInput = document.getElementById("coupon-expiry-date");
    const couponExpiryTimeInput = document.getElementById("coupon-expiry-time");
    const loginStatus = document.getElementById("login-status");
    const pageStatus = document.getElementById("coupon-status");
    const couponBody = document.getElementById("coupon-body");
    const couponCount = document.getElementById("coupon-count");
    const popup = document.getElementById("coupon-popup");
    const popupClose = document.getElementById("coupon-popup-close");
    const popupCountdown = document.getElementById("coupon-popup-countdown");
    const popupName = document.getElementById("coupon-popup-name");
    const popupCopy = document.getElementById("coupon-popup-copy");
    const summaryNodes = Array.from(document.querySelectorAll("[data-summary]")).reduce(function (map, node) {
        map[node.getAttribute("data-summary")] = node;
        return map;
    }, {});
    let coupons = [];
    let loading = false;
    let createInFlight = false;
    let popupTimer = 0;
    let popupRemaining = 30;

    const pad = function (value) {
        return String(value).padStart(2, "0");
    };

    const esc = function (value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character] || character;
        });
    };

    const parse = async function (response) {
        const text = await response.text();
        if (!text) return {};
        try { return JSON.parse(text); } catch (_error) { return { message: text }; }
    };

    const message = function (payload, fallback) {
        if (payload && typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
        if (payload && typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
        return fallback;
    };

    const setStatus = function (node, type, text) {
        if (!node) return;
        node.textContent = text;
        node.classList.toggle("error", type === "error");
        node.classList.toggle("success", type === "success");
    };

    const setAuthed = function (isAuthed) {
        if (gate) gate.hidden = Boolean(isAuthed);
        if (shell) shell.hidden = !isAuthed;
    };

    const formatDateTime = function (value) {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "Unavailable";
    };

    const toDateInputValue = function (date) {
        return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
    };

    const toTimeInputValue = function (date) {
        return pad(date.getHours()) + ":" + pad(date.getMinutes());
    };

    const buildDefaultExpiry = function () {
        const date = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
        date.setHours(23, 59, 0, 0);
        return date;
    };

    const seedExpiryFields = function (force) {
        if (!couponExpiryDateInput || !couponExpiryTimeInput) return;
        if (!force && couponExpiryDateInput.value && couponExpiryTimeInput.value) return;
        const expiry = buildDefaultExpiry();
        couponExpiryDateInput.value = toDateInputValue(expiry);
        couponExpiryTimeInput.value = toTimeInputValue(expiry);
        couponExpiryDateInput.min = toDateInputValue(new Date());
    };

    const clearCreateFieldErrors = function () {
        if (!createForm) return;
        createForm.querySelectorAll(".is-invalid").forEach(function (field) {
            field.classList.remove("is-invalid");
        });
    };

    const invalidateField = function (field) {
        if (!field || !field.classList) return;
        field.classList.add("is-invalid");
    };

    const focusField = function (field) {
        if (!field || typeof field.focus !== "function") return;
        try {
            field.focus({ preventScroll: true });
        } catch (_error) {
            field.focus();
        }
    };

    const buildExpiryValue = function () {
        const dateValue = couponExpiryDateInput ? couponExpiryDateInput.value.trim() : "";
        const timeValue = couponExpiryTimeInput ? couponExpiryTimeInput.value.trim() : "";

        if (!dateValue) {
            invalidateField(couponExpiryDateInput);
            return { error: "Expiry date is required.", field: couponExpiryDateInput };
        }

        if (!timeValue) {
            invalidateField(couponExpiryTimeInput);
            return { error: "Expiry time is required.", field: couponExpiryTimeInput };
        }

        const parsed = new Date(dateValue + "T" + timeValue);
        if (Number.isNaN(parsed.getTime())) {
            invalidateField(couponExpiryDateInput);
            invalidateField(couponExpiryTimeInput);
            return { error: "Expiry date and time must be valid.", field: couponExpiryDateInput };
        }

        if (parsed.getTime() <= Date.now()) {
            invalidateField(couponExpiryDateInput);
            invalidateField(couponExpiryTimeInput);
            return { error: "Expiry date and time must be set in the future.", field: couponExpiryDateInput };
        }

        return { value: parsed.toISOString() };
    };

    const validateCreateForm = function () {
        clearCreateFieldErrors();

        if (createNameInput && !createNameInput.value.trim()) {
            invalidateField(createNameInput);
            return { error: "Celebrity name is required.", field: createNameInput };
        }

        if (couponCodeInput && !couponCodeInput.value.trim()) {
            invalidateField(couponCodeInput);
            return { error: "Coupon code is required.", field: couponCodeInput };
        }

        return buildExpiryValue();
    };

    const statusClass = function (coupon) {
        if (coupon && coupon.expiresAt) {
            const expiresAt = new Date(coupon.expiresAt);
            if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
                return "expired";
            }
        }
        return coupon && coupon.status === "inactive" ? "inactive" : "active";
    };

    const statusLabel = function (coupon) {
        const type = statusClass(coupon);
        if (type === "expired") return "Expired";
        if (type === "inactive") return "Inactive";
        return "Active";
    };

    const setRefreshState = function (isLoading) {
        if (refreshBtn) {
            refreshBtn.disabled = isLoading;
            refreshBtn.textContent = isLoading ? "Refreshing..." : "Refresh";
        }
        sidebarRefreshButtons.forEach(function (button) {
            button.disabled = isLoading;
            button.textContent = isLoading ? "Refreshing..." : "Refresh View";
        });
    };

    const renderSummary = function (summary) {
        const safe = summary || {};
        Object.keys(summaryNodes).forEach(function (key) {
            if (summaryNodes[key]) summaryNodes[key].textContent = String(Number(safe[key]) || 0);
        });
    };

    const renderCoupons = function (summary) {
        renderSummary(summary);
        if (couponCount) couponCount.textContent = String(coupons.length) + (coupons.length === 1 ? " coupon" : " coupons");
        if (!couponBody) return;

        if (!coupons.length) {
            couponBody.innerHTML = '<tr><td colspan="7"><div class="empty">No celebrity coupons have been created yet.</div></td></tr>';
            return;
        }

        couponBody.innerHTML = coupons.map(function (coupon) {
            const remaining = typeof coupon.remainingRedemptions === "number"
                ? String(coupon.remainingRedemptions) + " left"
                : "Unlimited";
            return '<tr>' +
                '<td><div class="coupon-name"><strong>' + esc(coupon.celebrityName) + '</strong><span class="coupon-meta">Created by ' + esc(coupon.createdBy || "Admin Console") + '</span></div></td>' +
                '<td><div class="coupon-code-cell"><span class="coupon-code-value">' + esc(coupon.couponCode) + '</span><span class="coupon-meta">' + esc(coupon.offerDetails || "No extra offer details.") + '</span></div></td>' +
                '<td><div class="coupon-status-row"><span class="coupon-status-badge ' + esc(statusClass(coupon)) + '">' + esc(statusLabel(coupon)) + '</span></div><span class="coupon-meta">' + esc(remaining) + '</span></td>' +
                '<td><div class="coupon-redemptions"><strong>' + esc(String(Number(coupon.currentRedemptions) || 0)) + '</strong><span>' + esc(coupon.lastRedeemedAt ? "Last used " + formatDateTime(coupon.lastRedeemedAt) : "No redemptions yet") + '</span></div></td>' +
                '<td><div class="coupon-created"><strong>' + esc(formatDateTime(coupon.createdAt)) + '</strong><span class="coupon-meta">' + esc(coupon.createdBy || "Admin Console") + '</span></div></td>' +
                '<td><div class="coupon-expiry"><strong>' + esc(coupon.expiresAt ? formatDateTime(coupon.expiresAt) : "No expiry") + '</strong><span class="coupon-meta">' + esc(typeof coupon.maxRedemptions === "number" ? "Cap " + coupon.maxRedemptions : "Unlimited uses") + '</span></div></td>' +
                '<td><div class="coupon-details"><strong>' + esc(coupon.offerDetails || "No notes added") + '</strong><span class="coupon-meta">' + esc(coupon.status === "inactive" ? "Hidden from signup validation." : "Available to qualifying signups.") + '</span></div></td>' +
            '</tr>';
        }).join("");
    };

    const loadCoupons = async function (announce) {
        if (loading) return;
        loading = true;
        setRefreshState(true);

        try {
            const response = await fetch(api + "/dashboard/admin/celebrity-coupons", {
                credentials: "include",
                headers: { Accept: "application/json" }
            });
            const result = await parse(response);
            if (response.status === 401) {
                coupons = [];
                renderCoupons();
                setAuthed(false);
                setStatus(loginStatus, "error", "Admin session expired. Sign in again.");
                return;
            }
            if (!response.ok || !result.authorized) {
                throw new Error(message(result, "Unable to load celebrity coupons."));
            }
            coupons = Array.isArray(result.coupons) ? result.coupons : [];
            renderCoupons(result.summary);
            if (announce !== false) {
                setStatus(pageStatus, "success", "Celebrity coupon list updated.");
            }
        } catch (error) {
            coupons = [];
            renderCoupons();
            setStatus(pageStatus, "error", error instanceof Error ? error.message : "Unable to load celebrity coupons.");
        } finally {
            loading = false;
            setRefreshState(false);
        }
    };

    const openModal = function () {
        if (!modal) return;
        clearCreateFieldErrors();
        if (createStatus) setStatus(createStatus, "", "Create a new celebrity coupon.");
        seedExpiryFields(false);
        document.body.classList.add("coupon-modal-open");
        modal.hidden = false;
    };

    const closeModal = function () {
        if (!modal) return;
        document.body.classList.remove("coupon-modal-open");
        modal.hidden = true;
        if (createForm) createForm.reset();
        if (couponCodeInput) couponCodeInput.value = "";
        clearCreateFieldErrors();
        seedExpiryFields(true);
        if (createStatus) setStatus(createStatus, "", "Create a new celebrity coupon.");
    };

    const hidePopup = function () {
        if (popupTimer) {
            window.clearInterval(popupTimer);
            popupTimer = 0;
        }
        if (popup) popup.hidden = true;
    };

    const showPopup = function (coupon) {
        if (!popup) return;
        hidePopup();
        popupRemaining = 30;
        if (popupName) popupName.textContent = "Coupon successfully created";
        if (popupCopy) {
            popupCopy.textContent = String(coupon.couponCode || "") + " is now live for " + String(coupon.celebrityName || "celebrity campaign") + (coupon.expiresAt ? " and expires " + formatDateTime(coupon.expiresAt) + "." : ".");
        }
        if (popupCountdown) popupCountdown.textContent = "30s";
        popup.hidden = false;
        popupTimer = window.setInterval(function () {
            popupRemaining -= 1;
            if (popupCountdown) popupCountdown.textContent = String(Math.max(popupRemaining, 0)) + "s";
            if (popupRemaining <= 0) {
                hidePopup();
            }
        }, 1000);
    };

    const createCoupon = async function () {
        if (!createForm || createInFlight) return;
        const validation = validateCreateForm();
        if (validation && validation.error) {
            setStatus(createStatus, "error", validation.error);
            focusField(validation.field);
            return;
        }
        const data = new FormData(createForm);
        createInFlight = true;
        if (createSubmit) {
            createSubmit.disabled = true;
            createSubmit.textContent = "Creating...";
        }
        setStatus(createStatus, "", "Creating live celebrity coupon...");

        try {
            const response = await fetch(api + "/dashboard/admin/celebrity-coupons", {
                method: "POST",
                credentials: "include",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({
                    celebrityName: String(data.get("celebrity_name") || "").trim(),
                    couponCode: String(data.get("coupon_code") || "").trim(),
                    offerDetails: String(data.get("offer_details") || "").trim(),
                    status: String(data.get("status") || "active").trim(),
                    expiresAt: validation && validation.value ? validation.value : "",
                    maxRedemptions: String(data.get("max_redemptions") || "").trim()
                })
            });
            const result = await parse(response);
            if (response.status === 401) {
                closeModal();
                setAuthed(false);
                setStatus(loginStatus, "error", "Admin session expired. Sign in again.");
                return;
            }
            if (!response.ok || !result.created || !result.coupon) {
                throw new Error(message(result, "Unable to create celebrity coupon."));
            }
            closeModal();
            await loadCoupons(false);
            setStatus(pageStatus, "success", "Celebrity coupon created and published.");
            showPopup(result.coupon);
        } catch (error) {
            setStatus(createStatus, "error", error instanceof Error ? error.message : "Unable to create celebrity coupon.");
        } finally {
            createInFlight = false;
            if (createSubmit) {
                createSubmit.disabled = false;
                createSubmit.textContent = "Create Coupon";
            }
        }
    };

    const login = async function () {
        const identifier = loginId ? loginId.value.trim() : "";
        const password = loginPass ? loginPass.value : "";
        if (!identifier || !password) {
            setStatus(loginStatus, "error", "Enter the admin username and password to continue.");
            return;
        }
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.textContent = "Signing In...";
        }
        try {
            const response = await fetch(api + "/auth/admin/login", {
                method: "POST",
                credentials: "include",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ emailOrUsername: identifier, password: password })
            });
            const result = await parse(response);
            if (!response.ok || !result.success || !result.user) {
                throw new Error(message(result, "Unable to sign in to the admin console."));
            }
            if (loginPass) loginPass.value = "";
            setAuthed(true);
            setStatus(pageStatus, "success", "Admin session active. Loading celebrity coupons now.");
            await loadCoupons(false);
        } catch (error) {
            setAuthed(false);
            setStatus(loginStatus, "error", error instanceof Error ? error.message : "Unable to sign in to the admin console.");
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = "Sign In";
            }
        }
    };

    const restore = async function () {
        setStatus(loginStatus, "", "Checking admin session...");
        try {
            const response = await fetch(api + "/auth/admin/me", {
                credentials: "include",
                headers: { Accept: "application/json" }
            });
            const result = await parse(response);
            if (!response.ok || !result.authenticated || !result.user) {
                setAuthed(false);
                setStatus(loginStatus, "", "Sign in with the admin account to continue.");
                return;
            }
            setAuthed(true);
            setStatus(pageStatus, "success", "Admin session restored.");
            await loadCoupons(false);
        } catch (error) {
            setAuthed(false);
            setStatus(loginStatus, "error", error instanceof Error ? error.message : "Unable to restore the admin session.");
        }
    };

    const logout = async function () {
        try {
            await fetch(api + "/auth/admin/logout", {
                method: "POST",
                credentials: "include",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: "{}"
            });
        } catch {}
        coupons = [];
        renderCoupons();
        hidePopup();
        closeModal();
        document.body.classList.remove("coupon-modal-open");
        setAuthed(false);
        setStatus(loginStatus, "success", "Admin session closed.");
    };

    if (couponCodeInput) {
        couponCodeInput.addEventListener("input", function () {
            couponCodeInput.value = couponCodeInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        });
    }
    seedExpiryFields(true);
    if (loginForm) {
        loginForm.addEventListener("submit", function (event) {
            event.preventDefault();
            void login();
        });
    }
    if (logoutBtn) logoutBtn.addEventListener("click", function () { void logout(); });
    if (refreshBtn) refreshBtn.addEventListener("click", function () { void loadCoupons(true); });
    sidebarRefreshButtons.forEach(function (button) {
        button.addEventListener("click", function () { void loadCoupons(true); });
    });
    openCreateButtons.forEach(function (button) {
        button.addEventListener("click", function (event) {
            event.preventDefault();
            openModal();
        });
    });
    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modalCancel) modalCancel.addEventListener("click", closeModal);
    if (popupClose) popupClose.addEventListener("click", hidePopup);
    if (modal) {
        modal.addEventListener("click", function (event) {
            if (event.target === modal) closeModal();
        });
    }
    if (createForm) {
        createForm.addEventListener("submit", function (event) {
            event.preventDefault();
            void createCoupon();
        });
    }
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            if (modal && !modal.hidden) closeModal();
            if (popup && !popup.hidden) hidePopup();
        }
    });

    renderCoupons();
    void restore();
})();

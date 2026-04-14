(function () {
    const api = (!window.location || window.location.protocol === "file:")
        ? "http://localhost:4000/api/v1"
        : window.location.origin.replace(/\/+$/, "") + "/api/v1";
    const pageMode = document.body.getAttribute("data-people-page") || "users";
    const isInvestorsPage = pageMode === "investors";
    const gate = document.getElementById("gate");
    const shell = document.getElementById("shell");
    const loginForm = document.getElementById("login-form");
    const loginId = document.getElementById("login-id");
    const loginPass = document.getElementById("login-pass");
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const refreshBtn = document.getElementById("refresh-btn");
    const sidebarRefreshButtons = Array.from(document.querySelectorAll("[data-sidebar-refresh]"));
    const loginStatus = document.getElementById("login-status");
    const pageStatus = document.getElementById("people-status");
    const peopleBody = document.getElementById("people-body");
    const peopleCount = document.getElementById("people-count");
    const peopleFilter = document.getElementById("people-filter");
    const summaryNodes = Array.from(document.querySelectorAll("[data-summary]")).reduce(function (map, node) {
        map[node.getAttribute("data-summary")] = node;
        return map;
    }, {});
    let users = [];
    let loading = false;
    const pendingUserActions = new Set();
    const selectedUserActions = new Map();
    let confirmOverlay = null;
    let confirmTitle = null;
    let confirmCopy = null;
    let confirmUser = null;
    let confirmDetail = null;
    let confirmNote = null;
    let confirmConfirmBtn = null;
    let confirmCancelBtn = null;
    let confirmResolver = null;

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

    const initials = function (user) {
        const source = String((user && (user.name || user.username || user.email)) || "NV")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(function (part) { return part.charAt(0).toUpperCase(); })
            .join("");
        return source || "NV";
    };

    const dateText = function (value) {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "Unavailable";
    };

    const money = function (value) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) return "$0.00";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    };

    const verificationLabel = function (value) {
        if (value === "verified") return "Verified";
        if (value === "pending") return "Pending";
        if (value === "rejected") return "Rejected";
        return "Unverified";
    };

    const verificationClass = function (value) {
        if (value === "verified") return "verified";
        if (value === "pending") return "pending";
        if (value === "rejected") return "rejected";
        return "unverified";
    };

    const accountStatusLabel = function (value) {
        if (value === "suspended") return "Suspended";
        if (value === "deactivated") return "Deactivated";
        return "Active";
    };

    const accountStatusClass = function (value) {
        if (value === "suspended") return "suspended";
        if (value === "deactivated") return "deactivated";
        return "active";
    };

    const normalizeAccountStatus = function (value) {
        return value === "suspended" || value === "deactivated" ? value : "active";
    };

    const actionLabel = function (value) {
        if (value === "activate") return "Activate";
        if (value === "suspend") return "Suspend";
        if (value === "deactivate") return "Deactivate";
        if (value === "delete") return "Delete";
        return "Apply";
    };

    const actionTone = function (value) {
        if (value === "activate") return "success";
        if (value === "suspend") return "warning";
        if (value === "delete") return "danger";
        return "neutral";
    };

    const actionOptionsForStatus = function (status) {
        return status === "active"
            ? [
                { action: "suspend", label: "Suspend" },
                { action: "deactivate", label: "Deactivate" },
                { action: "delete", label: "Delete" }
            ]
            : status === "suspended"
                ? [
                    { action: "activate", label: "Activate" },
                    { action: "deactivate", label: "Deactivate" },
                    { action: "delete", label: "Delete" }
                ]
                : [
                    { action: "activate", label: "Activate" },
                    { action: "suspend", label: "Suspend" },
                    { action: "delete", label: "Delete" }
                ];
    };

    const accountActionControls = function (user) {
        if (!user || !user.id) return "";
        const status = normalizeAccountStatus(user.accountStatus);
        const busy = pendingUserActions.has(user.id);
        const actions = actionOptionsForStatus(status);
        const selectedAction = selectedUserActions.get(user.id) || "";
        const hasSelectedAction = actions.some(function (item) { return item.action === selectedAction; });
        return '<div class="row-action-form">' +
            '<select class="action-select" data-user-action-select data-user-id="' + esc(user.id) + '"' + (busy ? ' disabled' : '') + '>' +
            '<option value="">Select action</option>' +
            actions.map(function (item) {
                return '<option value="' + esc(item.action) + '"' + (hasSelectedAction && selectedAction === item.action ? ' selected' : '') + '>' + esc(item.label) + '</option>';
            }).join("") +
            '</select>' +
            '<button class="action-apply ' + esc(hasSelectedAction ? actionTone(selectedAction) : "") + '" type="button" data-user-action-apply data-user-id="' + esc(user.id) + '"' + (!hasSelectedAction || busy ? ' disabled' : '') + '>' + esc(busy ? "Applying..." : "Apply") + '</button>' +
            '</div>';
    };

    const ensureConfirmModal = function () {
        if (confirmOverlay || isInvestorsPage) return;
        const overlay = document.createElement("div");
        overlay.className = "confirm-overlay";
        overlay.hidden = false;
        overlay.style.display = "none";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.right = "0";
        overlay.style.bottom = "0";
        overlay.style.left = "0";
        overlay.style.zIndex = "2147483647";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.padding = "1.2rem";
        overlay.innerHTML = '' +
            '<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
            '<div class="confirm-header">' +
            '<span class="confirm-icon">NV</span>' +
            '<div class="confirm-head-copy">' +
            '<p class="eyebrow">Confirm Action</p>' +
            '<h2 class="confirm-title" id="confirm-title">Confirm account update</h2>' +
            '<p class="confirm-copy" id="confirm-copy">Review this account action before applying it.</p>' +
            '</div>' +
            '</div>' +
            '<div class="confirm-summary">' +
            '<p class="confirm-label">Selected user</p>' +
            '<strong class="confirm-user" id="confirm-user">Investor account</strong>' +
            '<p class="confirm-detail" id="confirm-detail">This action will update the user account immediately.</p>' +
            '</div>' +
            '<p class="confirm-note" id="confirm-note">This change is applied immediately after confirmation.</p>' +
            '<div class="confirm-actions">' +
            '<button class="confirm-btn ghost" type="button" data-confirm-cancel>Cancel</button>' +
            '<button class="confirm-btn" type="button" data-confirm-apply>Confirm</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        confirmOverlay = overlay;
        const dialog = overlay.querySelector(".confirm-dialog");
        if (dialog instanceof HTMLElement) {
            dialog.style.margin = "0 auto";
            dialog.style.position = "relative";
            dialog.style.top = "0";
            dialog.style.left = "0";
            dialog.style.transform = "none";
        }
        confirmTitle = overlay.querySelector("#confirm-title");
        confirmCopy = overlay.querySelector("#confirm-copy");
        confirmUser = overlay.querySelector("#confirm-user");
        confirmDetail = overlay.querySelector("#confirm-detail");
        confirmNote = overlay.querySelector("#confirm-note");
        confirmConfirmBtn = overlay.querySelector("[data-confirm-apply]");
        confirmCancelBtn = overlay.querySelector("[data-confirm-cancel]");

        const close = function (confirmed) {
            if (!confirmOverlay) return;
            confirmOverlay.style.display = "none";
            document.body.classList.remove("modal-open");
            const resolver = confirmResolver;
            confirmResolver = null;
            if (resolver) resolver(Boolean(confirmed));
        };

        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) close(false);
        });
        if (confirmCancelBtn) {
            confirmCancelBtn.addEventListener("click", function () { close(false); });
        }
        if (confirmConfirmBtn) {
            confirmConfirmBtn.addEventListener("click", function () { close(true); });
        }
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && confirmOverlay && !confirmOverlay.hidden) {
                close(false);
            }
        });
    };

    const requestActionConfirmation = function (user, action) {
        const userLabel = user && (user.name || user.username || user.email) ? (user.name || user.username || user.email) : "this user";
        const detail = action === "activate"
            ? "This will restore dashboard access and allow the user to sign in again."
            : action === "suspend"
                ? "This will revoke active sessions and block sign-in until the account is activated again."
                : action === "deactivate"
                    ? "This will revoke active sessions and keep the account disabled until it is activated again."
                    : "This will permanently delete the user account and related records.";
        ensureConfirmModal();
        if (!confirmOverlay || !confirmTitle || !confirmCopy || !confirmUser || !confirmDetail || !confirmNote || !confirmConfirmBtn) {
            return Promise.resolve(false);
        }
        confirmTitle.textContent = actionLabel(action) + " account";
        confirmCopy.textContent = "Review the final account action before applying it.";
        confirmUser.textContent = userLabel;
        confirmDetail.textContent = detail;
        confirmNote.textContent = action === "delete"
            ? "This removal is permanent and deletes the linked user records."
            : "The selected account state will be applied immediately after confirmation.";
        confirmConfirmBtn.textContent = actionLabel(action);
        confirmConfirmBtn.className = "confirm-btn " + actionTone(action);
        confirmOverlay.style.display = "flex";
        document.body.classList.add("modal-open");
        window.setTimeout(function () {
            if (confirmConfirmBtn) confirmConfirmBtn.focus();
        }, 0);
        return new Promise(function (resolve) {
            confirmResolver = resolve;
        });
    };

    const currentFilter = function () {
        return isInvestorsPage ? "investors" : ((peopleFilter && peopleFilter.value) || "all");
    };

    const filteredUsers = function () {
        const filter = currentFilter();
        return users.filter(function (user) {
            if (!user) return false;
            if (filter === "investors") return Boolean(user.isInvestor);
            if (filter === "verified") return user.verificationStatus === "verified";
            if (filter === "unverified") return user.verificationStatus === "unverified";
            if (filter === "pending") return user.verificationStatus === "pending";
            if (filter === "rejected") return user.verificationStatus === "rejected";
            return true;
        });
    };

    const renderSummary = function (summary) {
        const safe = summary || {};
        const filtered = filteredUsers();
        const investorUsers = users.filter(function (user) { return user && user.isInvestor; });
        const values = {
            total: isInvestorsPage ? investorUsers.length : (Number(safe.total) || users.length),
            investors: investorUsers.length,
            verified: filtered.filter(function (user) { return user.verificationStatus === "verified"; }).length,
            unverified: filtered.filter(function (user) { return user.verificationStatus !== "verified"; }).length
        };
        Object.keys(summaryNodes).forEach(function (key) {
            if (summaryNodes[key]) summaryNodes[key].textContent = String(Number(values[key]) || 0);
        });
    };

    const renderPeople = function (summary) {
        if (!peopleBody) return;
        const visible = filteredUsers();

        renderSummary(summary);
        if (peopleCount) {
            const noun = isInvestorsPage ? "investor" : "user";
            peopleCount.textContent = String(visible.length) + " " + noun + (visible.length === 1 ? "" : "s");
        }

        if (!visible.length) {
            peopleBody.innerHTML = '<tr><td colspan="' + (isInvestorsPage ? "7" : "9") + '"><div class="empty">' + esc(isInvestorsPage
                ? "No approved-deposit investors are available yet."
                : "No users match the current filter.") + '</div></td></tr>';
            return;
        }

        peopleBody.innerHTML = visible.map(function (user) {
            const isInvestor = Boolean(user.isInvestor);
            const roleLabel = isInvestor ? "Investor" : "User";
            const emailLabel = user.emailVerified === false ? "Email pending" : "Email verified";
            const emailClass = user.emailVerified === false ? "email-pending" : "email";
            const status = user.accountStatus === "suspended" || user.accountStatus === "deactivated"
                ? user.accountStatus
                : "active";
            if (isInvestorsPage) {
                return '<tr>' +
                '<td><div class="user-cell"><span class="avatar">' + esc(initials(user)) + '</span><div><strong>' + esc(user.name || user.username || "Investor") + '</strong><span>@' + esc(user.username || "user") + '</span></div></div></td>' +
                '<td><strong>' + esc(user.email || "No email") + '</strong><span>' + esc(user.phone || "No phone") + '</span></td>' +
                '<td><strong>' + esc(user.country || "No country") + '</strong><span>Joined ' + esc(dateText(user.createdAt)) + '</span></td>' +
                '<td><div class="badge-row"><span class="badge ' + esc(verificationClass(user.verificationStatus)) + '">' + esc(verificationLabel(user.verificationStatus)) + '</span><span class="badge ' + esc(emailClass) + '">' + esc(emailLabel) + '</span></div></td>' +
                '<td><div class="badge-row"><span class="badge ' + esc(isInvestor ? "investor" : "user") + '">' + esc(roleLabel) + '</span></div><span>' + esc(user.accountState || "Session active") + '</span></td>' +
                '<td><strong class="amount">' + esc(money(user.totalDeposit)) + '</strong><span>' + esc(String(Number(user.approvedDepositCount) || 0)) + ' approved deposit(s)</span></td>' +
                '<td><strong class="amount">' + esc(money(user.accountBalance)) + '</strong><span>Last deposit: ' + esc(user.lastDepositAt ? dateText(user.lastDepositAt) : "None") + '</span></td>' +
                '</tr>';
            }
            return '<tr>' +
                '<td><div class="user-cell"><span class="avatar">' + esc(initials(user)) + '</span><div><strong>' + esc(user.name || user.username || "Investor") + '</strong><span>@' + esc(user.username || "user") + '</span></div></div></td>' +
                '<td><strong>' + esc(user.email || "No email") + '</strong><span>' + esc(user.phone || "No phone") + '</span></td>' +
                '<td><strong>' + esc(user.country || "No country") + '</strong><span>Joined ' + esc(dateText(user.createdAt)) + '</span></td>' +
                '<td><div class="badge-row"><span class="badge ' + esc(verificationClass(user.verificationStatus)) + '">' + esc(verificationLabel(user.verificationStatus)) + '</span><span class="badge ' + esc(emailClass) + '">' + esc(emailLabel) + '</span></div></td>' +
                '<td><div class="badge-row"><span class="badge ' + esc(isInvestor ? "investor" : "user") + '">' + esc(roleLabel) + '</span></div><span>' + esc(isInvestor ? "Investor profile active" : "Registered user") + '</span></td>' +
                '<td><div class="badge-row"><span class="badge ' + esc(accountStatusClass(status)) + '">' + esc(accountStatusLabel(status)) + '</span></div><span>' + esc(user.accountState || "Session active") + '</span></td>' +
                '<td><strong class="amount">' + esc(money(user.totalDeposit)) + '</strong><span>' + esc(String(Number(user.approvedDepositCount) || 0)) + ' approved deposit(s)</span></td>' +
                '<td><strong class="amount">' + esc(money(user.accountBalance)) + '</strong><span>Last deposit: ' + esc(user.lastDepositAt ? dateText(user.lastDepositAt) : "None") + '</span></td>' +
                '<td>' + accountActionControls(user) + '</td>' +
            '</tr>';
        }).join("");
    };

    const setRefreshState = function (isLoading) {
        const label = isLoading ? "Refreshing..." : "Refresh";
        if (refreshBtn) {
            refreshBtn.disabled = isLoading;
            refreshBtn.textContent = label;
        }
        sidebarRefreshButtons.forEach(function (button) {
            button.disabled = isLoading;
            button.textContent = isLoading ? "Refreshing..." : "Refresh View";
        });
    };

    const loadUsers = async function (announce) {
        if (loading) return;
        loading = true;
        setRefreshState(true);

        try {
            const response = await fetch(api + "/dashboard/admin/users", {
                credentials: "include",
                headers: { Accept: "application/json" }
            });
            const result = await parse(response);
            if (response.status === 401) {
                users = [];
                renderPeople();
                setAuthed(false);
                setStatus(loginStatus, "error", "Admin session expired. Sign in again.");
                return;
            }
            if (!response.ok || !result.authorized) {
                throw new Error(message(result, "Unable to load admin users."));
            }
            users = Array.isArray(result.users) ? result.users : [];
            Array.from(selectedUserActions.keys()).forEach(function (userId) {
                const selectedAction = selectedUserActions.get(userId);
                const currentUser = users.find(function (entry) { return entry && entry.id === userId; });
                const stillAllowed = currentUser && actionOptionsForStatus(normalizeAccountStatus(currentUser.accountStatus)).some(function (item) {
                    return item.action === selectedAction;
                });
                if (!stillAllowed) {
                    selectedUserActions.delete(userId);
                }
            });
            renderPeople(result.summary);
            if (announce !== false) {
                setStatus(pageStatus, "success", isInvestorsPage
                    ? "Investor list updated from approved deposit records."
                    : "Users list updated from the database.");
            }
        } catch (error) {
            users = [];
            renderPeople();
            setStatus(pageStatus, "error", error instanceof Error ? error.message : "Unable to load admin users.");
        } finally {
            loading = false;
            setRefreshState(false);
        }
    };

    const manageUserAccount = async function (userId, action) {
        if (!userId || !action || pendingUserActions.has(userId)) return;

        pendingUserActions.add(userId);
        renderPeople();

        try {
            const response = await fetch(api + "/dashboard/admin/users/" + encodeURIComponent(userId) + "/action", {
                method: "POST",
                credentials: "include",
                headers: { Accept: "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({ action: action })
            });
            const result = await parse(response);
            if (response.status === 401) {
                users = [];
                renderPeople();
                setAuthed(false);
                setStatus(loginStatus, "error", "Admin session expired. Sign in again.");
                return;
            }
            if (!response.ok || !result.authorized) {
                throw new Error(message(result, "Unable to update that user account."));
            }

            selectedUserActions.delete(userId);
            await loadUsers(false);
            const successText = action === "delete"
                ? "User account deleted."
                : action === "activate"
                    ? "User account activated."
                    : action === "suspend"
                        ? "User account suspended."
                        : "User account deactivated.";
            setStatus(pageStatus, "success", successText);
        } catch (error) {
            setStatus(pageStatus, "error", error instanceof Error ? error.message : "Unable to update that user account.");
        } finally {
            pendingUserActions.delete(userId);
            renderPeople();
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
            setStatus(pageStatus, "success", "Admin session active. Loading users now.");
            await loadUsers(false);
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
            await loadUsers(false);
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
        users = [];
        renderPeople();
        setAuthed(false);
        setStatus(loginStatus, "success", "Admin session closed.");
    };

    if (loginForm) {
        loginForm.addEventListener("submit", function (event) {
            event.preventDefault();
            void login();
        });
    }
    if (logoutBtn) logoutBtn.addEventListener("click", function () { void logout(); });
    if (refreshBtn) refreshBtn.addEventListener("click", function () { void loadUsers(true); });
    sidebarRefreshButtons.forEach(function (button) {
        button.addEventListener("click", function () { void loadUsers(true); });
    });
    if (peopleFilter) peopleFilter.addEventListener("change", function () { renderPeople(); });
    if (peopleBody) {
        peopleBody.addEventListener("change", function (event) {
            const target = event.target;
            if (!(target instanceof HTMLSelectElement)) return;
            if (!target.matches("[data-user-action-select]")) return;
            const userId = target.getAttribute("data-user-id");
            if (!userId) return;
            if (target.value) {
                selectedUserActions.set(userId, target.value);
            } else {
                selectedUserActions.delete(userId);
            }
            renderPeople();
        });
        peopleBody.addEventListener("click", function (event) {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const button = target.closest("[data-user-action-apply]");
            if (!button) return;
            const userId = button.getAttribute("data-user-id");
            const action = userId ? selectedUserActions.get(userId) : "";
            if (!userId) return;
            if (!action) {
                setStatus(pageStatus, "error", "Select an account action before applying it.");
                return;
            }
            const user = users.find(function (entry) { return entry && entry.id === userId; });
            void requestActionConfirmation(user, action).then(function (confirmed) {
                if (!confirmed) return;
                void manageUserAccount(userId, action);
            });
        });
    }

    renderPeople();
    void restore();
})();

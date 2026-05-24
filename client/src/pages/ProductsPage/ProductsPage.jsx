import React, { useEffect, useState, useCallback, useRef } from "react";
import "./ProductsPage.css";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import ProductCard from "../../components/ProductCard";
import ProductModal from "../../components/ProductModal";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import socket from "../../api/socket";

// Ключ для хранения офлайн-очереди в localStorage
const PENDING_PRODUCTS_KEY = "pendingProducts";

// Реальная проверка сети (SW пропускает запросы с connectivity-check в сеть)
async function checkOnline() {
  if (!navigator.onLine) return false;
  try {
    const res = await fetch(
      `/manifest.json?connectivity-check=1&_=${Date.now()}`,
      {
        method: "HEAD",
        cache: "no-store",
        headers: { "X-Connectivity-Check": "1" },
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function useOffline() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const update = async () => {
      setOffline(!(await checkOnline()));
    };

    update();
    const interval = setInterval(update, 2000);

    const handleOffline = () => setOffline(true);
    const handleOnline = () => {
      update();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") update();
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return offline;
}

// Загружаем офлайн-очередь из localStorage
function loadPendingProducts() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_PRODUCTS_KEY) || "[]");
  } catch {
    return [];
  }
}

// Сохраняем офлайн-очередь в localStorage
function savePendingProducts(list) {
  localStorage.setItem(PENDING_PRODUCTS_KEY, JSON.stringify(list));
}

export default function ProductsPage() {
  const { user } = useAuth();
  const offline = useOffline();
  const prevOffline = useRef(offline);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editingProduct, setEditingProduct] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Напоминания (ПР17)
  const [reminderText, setReminderText] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminders, setReminders] = useState(() => {
    return JSON.parse(localStorage.getItem("reminders") || "[]");
  });

  const showToast = useCallback((message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadProducts = async (showLoader) => {
    try {
      if (showLoader) setLoading(true);
      const data = await api.getProducts();
      // Добавляем в конец список офлайн-карточек (ещё не синхронизированных)
      const pending = loadPendingProducts();
      setProducts([...data, ...pending]);
    } catch (err) {
      console.error("Ошибка загрузки товаров:", err);
      // Офлайн: показываем только то, что есть в pending
      const pending = loadPendingProducts();
      setProducts(pending);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  // Синхронизируем pending-карточки после восстановления сети
  const syncPendingProducts = useCallback(async () => {
    const pending = loadPendingProducts();
    if (pending.length === 0) return;

    let synced = 0;
    const failed = [];

    for (const product of pending) {
      try {
        const { _offlineId, ...payload } = product;
        const newProduct = await api.createProduct(payload);
        socket.emit("newProduct", newProduct);
        synced++;
      } catch {
        failed.push(product);
      }
    }

    savePendingProducts(failed);

    if (synced > 0) {
      showToast(`✅ Синхронизировано ${synced} товар(ов) из офлайн-очереди`);
      await loadProducts(false);
    }
  }, [showToast]);

  // При восстановлении сети — синхронизируем очередь
  useEffect(() => {
    if (prevOffline.current && !offline) {
      // Только что вернулся интернет
      syncPendingProducts();
    }
    prevOffline.current = offline;
  }, [offline, syncPendingProducts]);

  useEffect(() => {
    loadProducts(true);

    const handleProductAdded = (product) => {
      showToast(`Новый товар: ${product.title}`);
      loadProducts(false);
    };

    // Обработка сработавшего напоминания через WebSocket (ПР17)
    const handleReminderFired = (data) => {
      showToast(`Напоминание: ${data.text}`);
    };

    socket.on("productAdded", handleProductAdded);
    socket.on("reminderFired", handleReminderFired);

    return () => {
      socket.off("productAdded", handleProductAdded);
      socket.off("reminderFired", handleReminderFired);
    };
  }, [showToast]);

  // Только admin может добавлять карточки
  const isAdmin = user && user.role === "admin";
  const canCreate = user && (user.role === "seller" || user.role === "admin");

  const openCreate = () => { setModalMode("create"); setEditingProduct(null); setModalOpen(true); };
  const openEdit = (product) => { setModalMode("edit"); setEditingProduct(product); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingProduct(null); };

  const handleDelete = async (id) => {
    if (!window.confirm("Удалить товар?")) return;
    try {
      // Проверяем, не офлайн-карточка ли это
      const pending = loadPendingProducts();
      const isPending = pending.some(p => p._offlineId === id);
      if (isPending) {
        savePendingProducts(pending.filter(p => p._offlineId !== id));
        setProducts(prev => prev.filter(p => p._offlineId !== id && p.id !== id));
        return;
      }
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert("Ошибка удаления товара");
    }
  };

  const handleSubmitModal = async (payload) => {
    // Если офлайн и пользователь — admin — сохраняем в localStorage
    if (offline && isAdmin && modalMode === "create") {
      const offlineProduct = {
        ...payload,
        _offlineId: `offline_${Date.now()}`,
        id: `offline_${Date.now()}`,
        _isPending: true,
      };
      const pending = loadPendingProducts();
      pending.push(offlineProduct);
      savePendingProducts(pending);
      setProducts(prev => [...prev, offlineProduct]);
      showToast("📦 Товар сохранён офлайн. Будет отправлен при появлении сети.");
      closeModal();
      return;
    }

    try {
      if (modalMode === "create") {
        const newProduct = await api.createProduct(payload);
        setProducts((prev) => [...prev, newProduct]);
        socket.emit("newProduct", newProduct);
      } else {
        const updated = await api.updateProduct(payload.id, payload);
        setProducts((prev) => prev.map((p) => (p.id === payload.id ? updated : p)));
      }
      closeModal();
    } catch (err) {
      alert("Ошибка сохранения товара");
    }
  };

  // Добавление напоминания (ПР17)
  const handleAddReminder = (e) => {
    e.preventDefault();
    const text = reminderText.trim();
    const datetime = reminderTime;
    if (!text || !datetime) return;

    const timestamp = new Date(datetime).getTime();
    if (timestamp <= Date.now()) {
      alert("Дата напоминания должна быть в будущем");
      return;
    }

    const newReminder = { id: Date.now(), text, reminder: timestamp };
    const updated = [...reminders, newReminder];
    setReminders(updated);
    localStorage.setItem("reminders", JSON.stringify(updated));

    socket.emit("newReminder", {
      id: newReminder.id,
      text: newReminder.text,
      reminderTime: newReminder.reminder,
    });

    setReminderText("");
    setReminderTime("");
    showToast(`Напоминание запланировано: "${text}"`);
  };

  // Список pending-карточек для отображения в баннере
  const pendingCount = loadPendingProducts().length;

  return (
    <div className="page">
      <Header />
      <main className="main">
        <div className="container">
          <div className="toolbar">
            <h1 className="title">Каталог кастрюль</h1>
            {canCreate && (
              <button
                className="btn btn--primary"
                onClick={openCreate}
                disabled={offline && !isAdmin}
                title={offline && !isAdmin ? "Недоступно офлайн" : undefined}
              >
                + Добавить товар
              </button>
            )}
          </div>

          {/* Форма напоминания (ПР17) */}
          {user && (
            <div className="reminder-form-wrapper">
              <form className="reminder-form" onSubmit={handleAddReminder}>
                <input
                  className="input reminder-form__text"
                  type="text"
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                  placeholder="Текст напоминания"
                  required
                />
                <input
                  className="input reminder-form__time"
                  type="datetime-local"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn--success">
                  Напомнить
                </button>
              </form>
              {reminders.length > 0 && (
                <div className="reminders-list">
                  {reminders.map((r) => (
                    <div key={r.id} className="reminder-item">
                      <span>{r.text}</span>
                      <small>{new Date(r.reminder).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Баннер офлайн — отображается НАД карточками товара (ПР18) */}
          {offline && (
            <div className="offline-banner">
              <span className="offline-banner__icon">⚠️</span>
              <div className="offline-banner__text">
                <strong>Проверьте подключение к интернету</strong>
                <span>Показаны кэшированные данные</span>
              </div>
              {isAdmin && (
                <span className="offline-banner__hint">
                  Вы можете добавлять карточки — они сохранятся и загрузятся после подключения
                  {pendingCount > 0 && ` (в очереди: ${pendingCount})`}
                </span>
              )}
            </div>
          )}

          {loading ? (
            <div className="loading">Загрузка товаров...</div>
          ) : products.length === 0 ? (
            <div className="empty">Товаров пока нет</div>
          ) : (
            <div className="products-grid">
              {products.map((p) => (
                <ProductCard
                  key={p._offlineId || p.id}
                  product={p}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  isPending={!!p._isPending}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <ProductModal
        open={modalOpen}
        mode={modalMode}
        initialProduct={editingProduct}
        onClose={closeModal}
        onSubmit={handleSubmitModal}
      />
      {toast && <div className="ws-toast">{toast}</div>}
    </div>
  );
}

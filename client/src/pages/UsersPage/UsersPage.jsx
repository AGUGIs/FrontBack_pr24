import React, { useEffect, useState } from "react";
import { api } from "../../api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../pages/ProductsPage/ProductsPage.css";

function UserEditModal({ open, user, onClose, onSubmit }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", role: "user" });

  useEffect(() => {
    if (!open || !user) return;
    setForm({ first_name: user.first_name, last_name: user.last_name, role: user.role });
  }, [open, user]);

  if (!open) return null;

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ id: user.id, ...form });
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="modal__header">
          <div className="modal__title">Редактирование пользователя</div>
          <button className="iconBtn" onClick={onClose}>✕</button>
        </div>
        <form className="form" onSubmit={handleSubmit}>
          <label className="label">
            Имя
            <input className="input" value={form.first_name} onChange={handleChange("first_name")} />
          </label>
          <label className="label">
            Фамилия
            <input className="input" value={form.last_name} onChange={handleChange("last_name")} />
          </label>
          <label className="label">
            Роль
            <select className="input select" value={form.role} onChange={handleChange("role")}>
              <option value="user">Пользователь</option>
              <option value="seller">Продавец</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
          <div className="modal__footer">
            <button type="button" className="btn" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn--primary">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
      alert("Ошибка загрузки пользователей");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (payload) => {
    try {
      const updated = await api.updateUser(payload.id, payload);
      setUsers((prev) => prev.map((u) => (u.id === payload.id ? updated : u)));
      setEditModalOpen(false);
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      alert("Ошибка обновления пользователя");
    }
  };

  const handleToggleBlock = async (userId) => {
    try {
      const updated = await api.toggleBlockUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      console.error(err);
      alert("Ошибка блокировки пользователя");
    }
  };

  return (
    <div className="page">
      <Header />
      <main className="main">
        <div className="container">
          <div className="toolbar">
            <h1 className="title">Управление пользователями</h1>
          </div>
          {loading ? (
            <div className="loading">Загрузка...</div>
          ) : users.length === 0 ? (
            <div className="empty">Пользователей пока нет</div>
          ) : (
            <div className="users-list">
              {users.map((u) => (
                <div key={u.id} className="user-row">
                  <div className="user-row__info">
                    <span className="user-row__name">{u.first_name} {u.last_name}</span>
                    <span className="user-row__email">{u.email}</span>
                    <span className={`badge badge--${u.role}`}>{u.role}</span>
                    {u.blocked && <span className="user-row__blocked">Заблокирован</span>}
                  </div>
                  <div className="user-row__actions">
                    <button className="btn btn--sm btn--warning" onClick={() => handleEdit(u)}>
                      Изменить
                    </button>
                    <button
                      className={`btn btn--sm ${u.blocked ? "btn--success" : "btn--danger"}`}
                      onClick={() => handleToggleBlock(u.id)}
                    >
                      {u.blocked ? "Разблокировать" : "Заблокировать"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <UserEditModal
        open={editModalOpen}
        user={editingUser}
        onClose={() => { setEditModalOpen(false); setEditingUser(null); }}
        onSubmit={handleEditSubmit}
      />
    </div>
  );
}

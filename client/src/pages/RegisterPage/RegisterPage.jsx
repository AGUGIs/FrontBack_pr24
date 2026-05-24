import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getApiErrorMessage } from "../../api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../pages/ProductsPage/ProductsPage.css";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.email.trim() || !form.first_name.trim() || !form.last_name.trim() || !form.password) {
      setError("Заполните все поля");
      return;
    }
    try {
      setLoading(true);
      await register(form);
      navigate("/login");
    } catch (err) {
      const msg = err.response?.data?.error || "Ошибка регистрации";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <Header />
      <main className="main auth-page">
        <div className="auth-card">
          <h2 className="auth-card__title">Регистрация</h2>
          <p className="auth-card__subtitle">Создайте аккаунт для доступа к магазину</p>
          {error && <div className="error-msg">{error}</div>}
          <form className="form" onSubmit={handleSubmit} style={{ padding: 0 }}>
            <label className="label">
              Email *
              <input className="input" type="email" value={form.email} onChange={handleChange("email")} placeholder="ivan@mail.ru" autoFocus />
            </label>
            <label className="label">
              Имя *
              <input className="input" value={form.first_name} onChange={handleChange("first_name")} placeholder="Иван" />
            </label>
            <label className="label">
              Фамилия *
              <input className="input" value={form.last_name} onChange={handleChange("last_name")} placeholder="Иванов" />
            </label>
            <label className="label">
              Пароль *
              <input className="input" type="password" value={form.password} onChange={handleChange("password")} placeholder="••••••" />
            </label>
            <label className="label">
              Роль
              <select className="input select" value={form.role} onChange={handleChange("role")}>
                <option value="user">Пользователь</option>
                <option value="seller">Продавец</option>
                <option value="admin">Администратор</option>
              </select>
            </label>
            <button type="submit" className="btn btn--primary" disabled={loading} style={{ width: "100%", marginTop: 8 }}>
              {loading ? "Регистрация..." : "Зарегистрироваться"}
            </button>
          </form>
          <div className="auth-card__link">
            Уже есть аккаунт? <a onClick={() => navigate("/login")}>Войти</a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

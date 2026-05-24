import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getApiErrorMessage } from "../../api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../pages/ProductsPage/ProductsPage.css";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Заполните все поля");
      return;
    }
    try {
      setLoading(true);
      await login(email.trim(), password);
      navigate("/");
    } catch (err) {
      const msg = err.response?.data?.error || "Ошибка входа";
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
          <h2 className="auth-card__title">Вход в систему</h2>
          <p className="auth-card__subtitle">Введите учетные данные для входа</p>
          {error && <div className="error-msg">{error}</div>}
          <form className="form" onSubmit={handleSubmit} style={{ padding: 0 }}>
            <label className="label">
              Email
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivan@mail.ru" autoFocus />
            </label>
            <label className="label">
              Пароль
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </label>
            <button type="submit" className="btn btn--primary" disabled={loading} style={{ width: "100%", marginTop: 8 }}>
              {loading ? "Вход..." : "Войти"}
            </button>
          </form>
          <div className="auth-card__link">
            Нет аккаунта? <a onClick={() => navigate("/register")}>Зарегистрироваться</a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

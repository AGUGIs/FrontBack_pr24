import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PushToggle from "./PushToggle";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="header">
      <div className="header__inner">
        <div className="brand" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
          КастрюляМаркет
        </div>
        <div className="header__right">
          <nav className="header__nav">
            <button
              className={`btn--nav ${location.pathname === "/" ? "active" : ""}`}
              onClick={() => navigate("/")}
            >
              Товары
            </button>
            {user && user.role === "admin" && (
              <button
                className={`btn--nav ${location.pathname === "/users" ? "active" : ""}`}
                onClick={() => navigate("/users")}
              >
                Пользователи
              </button>
            )}
          </nav>
          <div className="header__user">
            {user ? (
              <>
                <span>
                  {user.first_name} {user.last_name}
                  <span className={`badge badge--${user.role}`} style={{ marginLeft: 6 }}>
                    {user.role}
                  </span>
                </span>
                <PushToggle />
                <button className="btn btn--sm" onClick={logout}>
                  Выйти
                </button>
              </>
            ) : (
              <>
                <button className="btn btn--sm btn--primary" onClick={() => navigate("/login")}>
                  Войти
                </button>
                <button className="btn btn--sm" onClick={() => navigate("/register")}>
                  Регистрация
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

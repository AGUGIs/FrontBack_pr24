import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProductCard({ product, onEdit, onDelete, isPending }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const canEdit = user && (user.role === "seller" || user.role === "admin");
  const canDelete = user && user.role === "admin";

  return (
    <div className={`product-card${isPending ? " product-card--pending" : ""}`}>
      <img className="product-card__image" src={product.image} alt={product.title} />
      <div className="product-card__body">
        <div className="product-card__category">{product.category}</div>
        <h3 className="product-card__title">{product.title}</h3>
        <div className="product-card__description">{product.description}</div>
        <div className="product-card__footer">
          <span className="product-card__price">{product.price.toLocaleString("ru-RU")} ₽</span>
          <span className="product-card__rating">★ {product.rating}</span>
        </div>
        <div className="product-card__stock">На складе: {product.stock} шт.</div>
      </div>
      <div className="product-card__actions">
        {user && !isPending && (
          <button className="btn btn--sm btn--primary" onClick={() => navigate(`/products/${product.id}`)}>
            Подробнее
          </button>
        )}
        {canEdit && !isPending && (
          <button className="btn btn--sm btn--warning" onClick={() => onEdit(product)}>
            Изменить
          </button>
        )}
        {canDelete && (
          <button className="btn btn--sm btn--danger" onClick={() => onDelete(product._offlineId || product.id)}>
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}

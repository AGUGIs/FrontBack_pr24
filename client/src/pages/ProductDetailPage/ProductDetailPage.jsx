import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import "../../pages/ProductsPage/ProductsPage.css";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getProductById(id);
        setProduct(data);
      } catch (err) {
        setError("Товар не найден");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  return (
    <div className="page">
      <Header />
      <main className="main">
        <div className="container">
          <button className="btn btn--sm" onClick={() => navigate("/")} style={{ marginBottom: 16 }}>
            ← Назад к каталогу
          </button>
          {loading ? (
            <div className="loading">Загрузка...</div>
          ) : error ? (
            <div className="error-msg">{error}</div>
          ) : product ? (
            <div className="product-detail">
              <img className="product-detail__image" src={product.image} alt={product.title} />
              <div className="product-detail__info">
                <div className="product-detail__category">{product.category}</div>
                <h1 className="product-detail__title">{product.title}</h1>
                <p className="product-detail__description">{product.description}</p>
                <div className="product-detail__price">{product.price.toLocaleString("ru-RU")} ₽</div>
                <div className="product-detail__meta">
                  <span>★ {product.rating} рейтинг</span>
                  <span>На складе: {product.stock} шт.</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}

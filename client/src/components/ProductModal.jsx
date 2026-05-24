import React, { useEffect, useState } from "react";

export default function ProductModal({ open, mode, initialProduct, onClose, onSubmit }) {
  const [form, setForm] = useState({ title: "", category: "", description: "", price: "", stock: "", rating: "", image: "" });

  useEffect(() => {
    if (!open) return;
    if (initialProduct) {
      setForm({
        title: initialProduct.title || "",
        category: initialProduct.category || "",
        description: initialProduct.description || "",
        price: initialProduct.price != null ? String(initialProduct.price) : "",
        stock: initialProduct.stock != null ? String(initialProduct.stock) : "",
        rating: initialProduct.rating != null ? String(initialProduct.rating) : "",
        image: initialProduct.image || "",
      });
    } else {
      setForm({ title: "", category: "", description: "", price: "", stock: "", rating: "", image: "" });
    }
  }, [open, initialProduct]);

  if (!open) return null;

  const title = mode === "edit" ? "Редактирование товара" : "Создание товара";

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.category.trim() || !form.description.trim()) {
      alert("Заполните все обязательные поля");
      return;
    }
    if (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0) {
      alert("Введите корректную цену");
      return;
    }
    onSubmit({
      id: initialProduct?.id,
      title: form.title.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      rating: Number(form.rating) || 0,
      image: form.image.trim() || "https://via.placeholder.com/300x200?text=Product",
    });
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__header">
          <div className="modal__title">{title}</div>
          <button className="iconBtn" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <form className="form" onSubmit={handleSubmit}>
          <label className="label">
            Название *
            <input className="input" value={form.title} onChange={handleChange("title")} placeholder="Название товара" autoFocus />
          </label>
          <label className="label">
            Категория *
            <input className="input" value={form.category} onChange={handleChange("category")} placeholder="Категория" />
          </label>
          <label className="label">
            Описание *
            <textarea className="input" value={form.description} onChange={handleChange("description")} placeholder="Описание товара" />
          </label>
          <label className="label">
            Цена *
            <input className="input" value={form.price} onChange={handleChange("price")} placeholder="Цена" inputMode="numeric" />
          </label>
          <label className="label">
            Количество на складе
            <input className="input" value={form.stock} onChange={handleChange("stock")} placeholder="0" inputMode="numeric" />
          </label>
          <label className="label">
            Рейтинг
            <input className="input" value={form.rating} onChange={handleChange("rating")} placeholder="0-5" inputMode="decimal" />
          </label>
          <label className="label">
            URL изображения
            <input className="input" value={form.image} onChange={handleChange("image")} placeholder="https://..." />
          </label>
          <div className="modal__footer">
            <button type="button" className="btn" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn--primary">{mode === "edit" ? "Сохранить" : "Создать"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

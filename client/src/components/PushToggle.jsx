import React, { useState, useEffect } from "react";
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from "../api/push";

export default function PushToggle() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    isPushSubscribed().then((val) => {
      setSubscribed(val);
      setLoading(false);
    });
  }, []);

  const handleEnable = async () => {
    if (Notification.permission === "denied") {
      alert("Уведомления запрещены в настройках браузера. Разрешите их вручную.");
      return;
    }
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        alert("Необходимо разрешить уведомления.");
        return;
      }
    }
    setLoading(true);
    const ok = await subscribeToPush();
    setSubscribed(ok);
    setLoading(false);
  };

  const handleDisable = async () => {
    setLoading(true);
    await unsubscribeFromPush();
    setSubscribed(false);
    setLoading(false);
  };

  if (loading) return null;

  return subscribed ? (
    <button className="btn btn--sm btn--danger" onClick={handleDisable}>
      Отключить уведомления
    </button>
  ) : (
    <button className="btn btn--sm btn--success" onClick={handleEnable}>
      Включить уведомления
    </button>
  );
}

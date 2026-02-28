import { useState } from "react";
import Home from "./pages/Home";
import WheelPage from "./pages/Wheel";

export default function App() {
  const [wheelId, setWheelId] = useState<string | null>(null);

  return wheelId ? (
    <WheelPage wheelId={wheelId} onBack={() => setWheelId(null)} />
  ) : (
    <Home onOpenWheel={(id) => setWheelId(id)} />
  );
}
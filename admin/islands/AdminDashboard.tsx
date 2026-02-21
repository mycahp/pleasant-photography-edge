import { useSignal } from "@preact/signals";
import UploadForm from "./UploadForm.tsx";
import ProductList from "./ProductList.tsx";

export default function AdminDashboard() {
  const refreshKey = useSignal(0);

  function handleCreated() {
    refreshKey.value += 1;
  }

  return (
    <div>
      <h1>Create Photo Product</h1>
      <UploadForm onCreated={handleCreated} />
      <h2>Products</h2>
      <ProductList refreshKey={refreshKey.value} />
    </div>
  );
}

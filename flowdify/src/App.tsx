import { WorkspaceProvider } from "./context/WorkspaceContext";
import Sidebar from "./components/Sidebar";
import Canvas from "./components/Canvas";

export default function App() {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-canvas">
        <Sidebar />
        <Canvas />
      </div>
    </WorkspaceProvider>
  );
}

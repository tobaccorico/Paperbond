import DeleteChat from "./components/globals/DeleteChat";
import DeleteContact from "./components/globals/DeleteContact";
import NewContactForm from "./components/globals/NewContactForm";
import Sidebar from "./components/globals/Sidebar";
import VoiceCallModal from "./components/globals/VoiceCallModal";
import VideoCallModal from "./components/globals/VideoCallModal";
import CreateGroupModal from "./components/pages/Chat/CreateGroupModal";

import AuthGate from "./components/globals/AuthGate";
import Notification from "./components/globals/Notification";
import Chat from "./pages/Chat";
import UserProfile from "./pages/UserProfile";
import useInit from "./hooks/useInit";
import { useSelector } from "react-redux";
import useAppHeight from "./hooks/useAppHeight";

function App() {
  // Still initializes whatever your app needs (store, sockets, etc.)
  useInit();
  const modalType = useSelector((state) => state.modalReducer.type);
  useAppHeight();
  const forceLogout = async () => {
    await fetch("/api/auth/logout", { 
      method: "POST", 
      credentials: "include" 
    });
    window.location.reload();
  };
  return (
    <AuthGate>
      <button 
        onClick={forceLogout}
        className="fixed bottom-4 left-4 z-50 bg-danger text-white px-4 py-2 rounded"
      >
        Force Logout
      </button>
      <div className="w-full h-full flex overflow-hidden bg-primary relative">
        {/* Sidebar + Chat + Profile are only visible when authed because of AuthGate */}
        <Sidebar />
        <Chat />
        <UserProfile />

        {/* Notification */}
        <Notification />

        {/* Modals */}
        <DeleteChat />
        <DeleteContact />
        <NewContactForm />
        {modalType === "voiceCallModal" && <VoiceCallModal />}
        {modalType === "videoCallModal" && <VideoCallModal />}
        {modalType === "createGroupModal" && <CreateGroupModal />}
      </div>
    </AuthGate>
  );
}

export default App;

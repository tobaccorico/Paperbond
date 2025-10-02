import DeleteChat from "./components/globals/DeleteChat";
import DeleteContact from "./components/globals/DeleteContact";
import NewContactForm from "./components/globals/NewContactForm";
import Sidebar from "./components/globals/Sidebar";
import VoiceCallModal from "./components/globals/VoiceCallModal";
import VideoCallModal from "./components/globals/VideoCallModal";
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
  const modalType = useSelector((state: any) => state.modalReducer.type);
  useAppHeight();

  return (
    <AuthGate>
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
      </div>
    </AuthGate>
  );
}

export default App;

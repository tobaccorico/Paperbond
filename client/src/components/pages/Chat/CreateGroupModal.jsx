import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { modalActions } from "../../../store/modalSlice";
import { notificationActions } from "../../../store/notificationSlice";
import { chatListActions } from "../../../store/chatListSlice";
import Modal from "../../globals/Modal";

function CreateGroupModal() {
  const [groupName, setGroupName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();

  const handleCreate = async (e) => {
    e.preventDefault(); 
    e.stopPropagation();
    
    setIsLoading(true);
    try {
      const res = await fetch("/api/chatRoom/create-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: groupName,
          members: []
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create group");
      }

      const { data } = await res.json();
      
      dispatch(chatListActions.addChatRoom(data.chatRoom));
      
      dispatch(modalActions.closeModal());
      dispatch(notificationActions.addNotification({
        message: "Group created successfully!",
        type: "success",
      }));

    } catch (error) {
      console.error("Create group error:", error);
      dispatch(notificationActions.addNotification({
        message: error.message || "Failed to create group",
        type: "error",
      }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal 
      typeValue="createGroupModal" 
      className="!w-[30rem] !px-[2rem] !py-[2rem]"
    >
      <form onSubmit={handleCreate}> {/* WRAP IN FORM */}
        <h2 className="text-[2rem] font-semibold mb-[2rem]">Create Group Chat</h2>
        <input
          type="text"
          placeholder="Group name (optional)"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="w-full p-[1rem] border border-border rounded-lg mb-[2rem] bg-primary text-primary-text outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCreate(e);
            }
          }}
        />
        <div className="flex gap-[1rem]">
          <button
            type="button" // ADD TYPE
            onClick={(e) => {
              e.preventDefault();
              dispatch(modalActions.closeModal());
            }}
            disabled={isLoading}
            className="flex-1 p-[1rem] rounded-lg bg-secondary-light-text hover:opacity-80"
          >
            Cancel
          </button>
          <button
            type="submit" // CHANGE TO SUBMIT
            disabled={isLoading}
            className="flex-1 p-[1rem] rounded-lg bg-cta-icon text-white hover:opacity-80 disabled:opacity-50"
          >
            {isLoading ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CreateGroupModal;
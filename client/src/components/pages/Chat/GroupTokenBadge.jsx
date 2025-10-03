import React, { useEffect, useState } from "react";
import { useGroupToken } from "../../../hooks/useGroupToken";

function GroupTokenBadge({ groupChatId, className }) {
  const { fetchTokenInfo, tokenInfo } = useGroupToken();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (groupChatId) {
      fetchTokenInfo(groupChatId).finally(() => setLoading(false));
    }
  }, [groupChatId, fetchTokenInfo]);

  if (loading || !tokenInfo?.hasToken) return null;

  const formatBalance = (balance) => {
    const num = parseInt(balance) / 1e18;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(2);
  };

  const formatPrice = (price) => {
    const num = parseInt(price) / 1e18;
    return `$${num.toFixed(4)}`;
  };

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <div className="bg-cta-icon/20 px-2 py-1 rounded-full flex items-center gap-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12M6 12h12" />
        </svg>
        <span className="font-semibold">
          {formatBalance(tokenInfo.userTokenBalance)}
        </span>
      </div>
      <span className="text-secondary-text">
        @ {formatPrice(tokenInfo.price)}
      </span>
    </div>
  );
}

export default GroupTokenBadge;
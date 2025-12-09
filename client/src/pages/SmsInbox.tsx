import React from 'react';
import { formatRelativeTime, getInitials, getAvatarColor } from "@/lib/utils";

export default function SmsInbox() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">SMS Inbox</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500 text-center p-10">
          SMS Inbox is under construction. This page will display your incoming and outgoing SMS messages.
        </p>
      </div>
    </div>
  );
}
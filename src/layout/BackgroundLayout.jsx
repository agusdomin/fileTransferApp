function BackgroundLayout({ children, color = "bg-gray-100" }) {
  // <div className={`flex flex-col items-center justify-center min-h-screen ${color}`}>
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700">
      {children}
    </div>
  );
}

export default BackgroundLayout;
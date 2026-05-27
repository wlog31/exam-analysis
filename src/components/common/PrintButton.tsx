export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden text-sm bg-white border border-gray-300 hover:border-gray-400 text-gray-700 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
    >
      인쇄
    </button>
  )
}


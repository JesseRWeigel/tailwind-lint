export function Card({ color, active }) {
  return (
    <div className={`flex flex-colum gap-7 bg-${color}-500`}>
      <span className={active ? "text-white" : "opacity-50"}>Hello</span>
    </div>
  );
}

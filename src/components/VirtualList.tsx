// Виртуальный список: в DOM находятся только видимые строки (+ немного запаса).
// В библиотеке может быть 5000 песен — без этого окно тормозило бы и ело память,
// а миниатюры обложек грузились бы все сразу.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Props<T> {
  items: T[];
  rowHeight: number;
  getKey: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  /** Сколько строк рисовать за краем экрана */
  overscan?: number;
}

export function VirtualList<T>({ items, rowHeight, getKey, renderRow, className = "", overscan = 6 }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  // Следим за высотой контейнера (окно могут растянуть)
  useLayoutEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    setHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  return (
    <div ref={ref} className={`vlist ${className}`} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div className="vlist-inner" style={{ height: items.length * rowHeight }}>
        {items.slice(first, last).map((item, i) => (
          <div
            key={getKey(item)}
            className="vlist-row"
            style={{ height: rowHeight, transform: `translateY(${(first + i) * rowHeight}px)` }}
          >
            {renderRow(item, first + i)}
          </div>
        ))}
      </div>
    </div>
  );
}

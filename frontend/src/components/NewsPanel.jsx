import React from 'react';

const NewsPanel = ({ news, symbol }) => {
  if (!news || news.length === 0) {
    return (
      <div className="text-muted text-xs-mono p-4 italic">
        No news found for {symbol || 'selected stock'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h3 className="text-xs-mono font-bold uppercase text-muted border-b border-accent pb-2">
        Latest News: {symbol}
      </h3>
      <div className="flex flex-col gap-3">
        {news.map((item, index) => (
          <a 
            key={index} 
            href={item.link} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="group block"
          >
            <p className="text-sm-mono leading-tight group-hover:text-muted transition-colors">
              {item.title}
            </p>
            <span className="text-xs-mono text-muted block mt-1 uppercase">
              {item.publisher}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
};

export default NewsPanel;

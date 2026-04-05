import React from 'react';
import { Block, BlockType } from '../../../backend/src/core/Block'; // We can't import across roots easily in real build.
// So we redefine or use the type from hooks.

interface BlockProps {
    id: number;
    type: string;
    fileId: number | null;
}

export const DiskGrid: React.FC<{ blocks: BlockProps[] }> = ({ blocks }) => {
    const getColor = (type: string, fileId: number | null) => {
        switch (type) {
            case 'FREE': return 'bg-gray-700';
            case 'DATA':
                // Generate a consistent color for fileId
                if (fileId !== null) {
                    const hues = [500, 600, 400];
                    const colors = ['bg-blue', 'bg-green', 'bg-purple', 'bg-red', 'bg-yellow', 'bg-pink'];
                    const color = colors[fileId % colors.length];
                    const shade = hues[fileId % hues.length];
                    // Tailwind requires full class names usually. Using style for dynamic color.
                    return `file-${fileId}`;
                }
                return 'bg-blue-500';
            case 'INODE_TABLE': return 'bg-orange-500';
            case 'BLOCK_BITMAP': return 'bg-teal-500';
            case 'INODE_BITMAP': return 'bg-teal-600';
            case 'SUPERBLOCK': return 'bg-red-600';
            default: return 'bg-gray-500';
        }
    };

    // Helper for dynamic colors
    const getStyle = (type: string, fileId: number | null) => {
        if (type === 'DATA' && fileId !== null) {
            const hue = (fileId * 137.5) % 360;
            return { backgroundColor: `hsl(${hue}, 70%, 50%)` };
        }
        return {};
    };

    return (
        <div className="grid grid-cols-10 gap-1 p-4 bg-gray-900 rounded border border-gray-700 overflow-y-auto max-h-96">
            {blocks.map(block => (
                <div
                    key={block.id}
                    title={`Block ${block.id} (${block.type})`}
                    className={`w-6 h-6 rounded-sm text-xs flex items-center justify-center cursor-help transition-colors ${block.type === 'FREE' ? 'bg-gray-700 hover:bg-gray-600' : ''
                        }`}
                    style={getStyle(block.type, block.fileId)}
                >
                    {/* {block.id} */}
                </div>
            ))}
        </div>
    );
};

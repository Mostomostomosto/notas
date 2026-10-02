import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  Note,
  NoteBlock,
  ChecklistItem,
  ChecklistBlock,
  ColumnsBlock,
  MarkdownBlock,
  GalleryBlock,
  GalleryItem,
  Tag,
  desaturateColor,
} from '../db/db';
import { scheduleSync } from '../services/syncEngine';
import {
  Pin,
  Tag as TagIcon,
  Trash2,
  Plus,
  Type,
  Heading,
  CheckSquare,
  Image as ImageIcon,
  Columns3,
  Settings2,
  RotateCcw,
  Check,
  X,
  Undo2,
  Redo2,
  FileText,
  FileCode,
  Eye,
  Pencil,
  Upload,
  Images,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { marked } from 'marked';

interface NoteDetailProps {
  note: Note | null;
  token: string | null;
  onNoteDeleted?: (deletedNote: Note) => void;
}

interface NoteSnapshot {
  title: string;
  tag: string;
  pinned: boolean;
  deleted: boolean;
  blocks: NoteBlock[];
}

const createSnapshot = (n: Note): NoteSnapshot => ({
  title: n.title,
  tag: n.tag,
  pinned: n.pinned,
  deleted: n.deleted,
  blocks: JSON.parse(JSON.stringify(n.blocks)),
});

interface ColumnItem {
  id: string;
  name: string;
  originalIndex?: number;
}

interface ColumnsModalState {
  isOpen: boolean;
  blockId?: string;
  columns: ColumnItem[];
}

interface AutoResizeTextBlockProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const AutoResizeTextBlock: React.FC<AutoResizeTextBlockProps> = ({
  value,
  disabled,
  onChange,
  placeholder,
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const scrollContainer = textarea.closest('.overflow-y-auto') as HTMLElement | null;
    const prevScrollTop = scrollContainer
      ? scrollContainer.scrollTop
      : (typeof window !== 'undefined' ? window.scrollY || document.documentElement.scrollTop : 0);

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 44)}px`;

    if (scrollContainer && scrollContainer.scrollTop !== prevScrollTop) {
      scrollContainer.scrollTop = prevScrollTop;
    }
  };

  useLayoutEffect(() => {
    adjustHeight();
  }, [value]);

  useEffect(() => {
    adjustHeight();
    const t = setTimeout(adjustHeight, 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === 'undefined') return;

    let lastWidth = textarea.clientWidth;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (Math.abs(newWidth - lastWidth) > 1) {
          lastWidth = newWidth;
          adjustHeight();
        }
      }
    });

    observer.observe(textarea);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value);
        adjustHeight();
      }}
      onInput={() => adjustHeight()}
      placeholder={placeholder}
      className={className}
      style={{
        overflow: 'hidden',
        minHeight: '44px',
        ...({ fieldSizing: 'content' } as React.CSSProperties),
      }}
    />
  );
};

interface MarkdownBlockItemProps {
  block: MarkdownBlock;
  disabled?: boolean;
  onUpdateContent: (newContent: string) => void;
  onReplaceFile: (newContent: string, fileName?: string) => void;
}

const MarkdownBlockItem: React.FC<MarkdownBlockItemProps> = ({
  block,
  disabled,
  onUpdateContent,
  onReplaceFile,
}) => {
  const [isEditing, setIsEditing] = useState(() => !block.content);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        onReplaceFile(text, file.name);
        setIsEditing(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const parsedHtml = React.useMemo(() => {
    if (!block.content) return '';
    try {
      return marked.parse(block.content, { gfm: true, breaks: true }) as string;
    } catch (err) {
      console.error('Error al parsear Markdown:', err);
      return `<p>${block.content}</p>`;
    }
  }, [block.content]);

  return (
    <div className="rounded-xl border border-[#E4DECE] bg-[#FAF8F5] overflow-hidden transition-all shadow-2xs group/md">
      {/* Barra superior del bloque Markdown */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#F4EFE6]/70 border-b border-[#E4DECE] text-xs text-[#8A8478]">
        <div className="flex items-center gap-1.5 font-medium min-w-0">
          <FileCode className="w-3.5 h-3.5 text-[#3F6E64] shrink-0" />
          <span className="text-[#2B2A28] text-[11px] font-semibold tracking-wide uppercase">Markdown</span>
          {block.fileName && (
            <span
              className="bg-white border border-[#E4DECE] px-2 py-0.5 rounded-full text-[10.5px] text-[#8A8478] truncate max-w-[200px]"
              title={block.fileName}
            >
              {block.fileName}
            </span>
          )}
        </div>

        {!disabled && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white text-[#8A8478] hover:text-[#2B2A28] transition-colors cursor-pointer text-[11px]"
              title="Cargar otro archivo .md"
            >
              <Upload className="w-3 h-3" />
              <span className="hidden sm:inline">Cargar archivo</span>
            </button>

            {isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#3F6E64] hover:bg-[#345b53] text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                <Eye className="w-3 h-3" />
                <span>Vista previa</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white text-[#8A8478] hover:text-[#2B2A28] transition-colors cursor-pointer text-[11px]"
                title="Editar código Markdown"
              >
                <Pencil className="w-3 h-3" />
                <span>Editar</span>
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Contenido: Vista previa o Editor */}
      <div className="p-4 bg-white min-h-[50px]">
        {isEditing ? (
          <div>
            <AutoResizeTextBlock
              value={block.content}
              disabled={disabled}
              onChange={onUpdateContent}
              placeholder="# Escribe aquí en Markdown...&#10;**Negrita**, *cursiva*, listas con - o 1., tablas, etc."
              className="w-full text-xs font-mono leading-relaxed text-[#2B2A28] outline-none bg-transparent resize-none placeholder-[#8A8478]/40"
            />
          </div>
        ) : block.content ? (
          <div
            className="markdown-content select-text"
            dangerouslySetInnerHTML={{ __html: parsedHtml }}
          />
        ) : (
          <div className="text-center py-6 text-xs text-[#8A8478]">
            <FileCode className="w-8 h-8 mx-auto mb-2 text-[#8A8478]/40" />
            <p className="font-medium text-[#2B2A28] mb-1">Bloque Markdown sin contenido</p>
            <p className="text-[11px] text-[#8A8478] mb-3">Puedes cargar un archivo .md o redactarlo directamente.</p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#3F6E64] text-white rounded-md text-xs font-semibold hover:bg-[#345b53] cursor-pointer transition-colors shadow-2xs"
              >
                <Upload className="w-3 h-3" /> Cargar archivo .md
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F7F4EE] border border-[#E4DECE] text-[#2B2A28] rounded-md text-xs font-medium hover:bg-white cursor-pointer transition-colors"
              >
                <Pencil className="w-3 h-3" /> Escribir texto
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface GalleryBlockViewProps {
  block: GalleryBlock;
  disabled?: boolean;
  onUpdateTitle: (title: string) => void;
  onAddImages: (items: GalleryItem[]) => void;
  onDeleteImage: (itemId: string) => void;
  onEditImage: (itemId: string, title: string, description: string) => void;
  onOpenLightbox: (index: number) => void;
}

export const GalleryBlockView: React.FC<GalleryBlockViewProps> = ({
  block,
  disabled,
  onUpdateTitle,
  onAddImages,
  onDeleteImage,
  onEditImage,
  onOpenLightbox,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string; title: string; description: string } | null>(null);

  // Estados para el Modal de Añadir
  const [modalTitle, setModalTitle] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [modalFiles, setModalFiles] = useState<Array<{ file: File; url: string; title: string }>>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isModalDragOver, setIsModalDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetModalState = () => {
    setModalTitle('');
    setModalDesc('');
    setModalFiles([]);
    setIsModalDragOver(false);
  };

  const handleOpenAddModal = () => {
    resetModalState();
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    resetModalState();
  };

  const processFiles = (fileList: FileList | File[]) => {
    const arr = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;

    const readPromises = arr.map((file) => {
      return new Promise<{ file: File; url: string; title: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const rawName = file.name.replace(/\.[^/.]+$/, '');
          resolve({
            file,
            url: reader.result as string,
            title: rawName,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then((results) => {
      setModalFiles((prev) => [...prev, ...results]);
      if (!modalTitle && results.length > 0) {
        setModalTitle(results[0].title);
      }
    });
  };

  const handleConfirmAdd = () => {
    if (modalFiles.length === 0) return;

    const newItems: GalleryItem[] = modalFiles.map((mf, i) => ({
      id: `img_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      url: mf.url,
      title: modalFiles.length === 1 && modalTitle ? modalTitle : mf.title,
      description: modalDesc,
      fileName: mf.file.name,
    }));

    onAddImages(newItems);
    handleCloseAddModal();
  };

  const handleDirectDropOnEmptyState = (fileList: FileList) => {
    const arr = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;

    const readPromises = arr.map((file, i) => {
      return new Promise<GalleryItem>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const rawName = file.name.replace(/\.[^/.]+$/, '');
          resolve({
            id: `img_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
            url: reader.result as string,
            title: rawName,
            fileName: file.name,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then((newItems) => {
      onAddImages(newItems);
    });
  };

  return (
    <div className="space-y-3 my-3">
      {/* 1. Header / Subsection row (nodo-galeria.html) */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#E4DECE]">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-[#3F6E64] flex items-center justify-center w-6 h-6 rounded-lg bg-[#3F6E64]/10 shrink-0">
            <Images className="w-3.5 h-3.5" />
          </span>
          <input
            type="text"
            value={block.title || 'Galería de imágenes'}
            disabled={disabled}
            onChange={(e) => onUpdateTitle(e.target.value)}
            placeholder="Título de la galería..."
            className="font-semibold text-xs sm:text-sm text-[#2B2A28] bg-transparent outline-none hover:bg-black/5 focus:bg-white focus:ring-1 focus:ring-[#3F6E64]/30 px-2 py-0.5 rounded transition-colors flex-1 max-w-sm"
          />
          <span className="font-mono text-[11px] text-[#8A8478] bg-[#EDEAE2] px-2 py-0.5 rounded-full shrink-0">
            {block.items.length} {block.items.length === 1 ? 'foto' : 'fotos'}
          </span>
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2B2A28] hover:bg-black text-[#F7F4EE] text-xs font-semibold cursor-pointer shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Añadir imagen</span>
          </button>
        )}
      </div>

      {/* 2. Masonry Gallery Content */}
      {block.items.length > 0 ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3 space-y-3">
          {block.items.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => onOpenLightbox(idx)}
              className="break-inside-avoid rounded-xl overflow-hidden cursor-pointer relative group bg-[#1F1C22] border border-[#E4DECE] shadow-xs transition-all hover:border-[#3F6E64] hover:shadow-md"
            >
              <img
                src={item.url}
                alt={item.title || item.fileName || 'Foto'}
                className="w-full h-auto block object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />

              {/* Overlay visual con gradiente sobre la imagen (nodo-galeria.html) */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 pointer-events-none">
                {item.title && (
                  <h4 className="font-semibold text-white text-xs leading-snug drop-shadow-sm">
                    {item.title}
                  </h4>
                )}
                {item.description && (
                  <p className="text-[11px] text-white/80 line-clamp-2 mt-0.5 drop-shadow-sm">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Botones de acción en la esquina superior */}
              {!disabled && (
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItem({
                        id: item.id,
                        title: item.title || '',
                        description: item.description || '',
                      });
                    }}
                    className="p-1.5 bg-black/60 hover:bg-black/90 text-white rounded-lg backdrop-blur-xs transition-colors cursor-pointer"
                    title="Editar información"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteImage(item.id);
                    }}
                    className="p-1.5 bg-black/60 hover:bg-[#B4553F] text-white rounded-lg backdrop-blur-xs transition-colors cursor-pointer"
                    title="Eliminar foto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Estado vacío interactivo con dropzone */
        <div
          onClick={() => !disabled && handleOpenAddModal()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (!disabled && e.dataTransfer.files?.length > 0) {
              handleDirectDropOnEmptyState(e.dataTransfer.files);
            }
          }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-[#3F6E64] bg-[#3F6E64]/5'
              : 'border-[#E4DECE] bg-[#FAF9F5] hover:border-[#8A8478]'
          }`}
        >
          <Images className="w-9 h-9 mx-auto mb-2 text-[#8A8478]/40" />
          <p className="text-xs font-semibold text-[#2B2A28] mb-1">
            Galería de imágenes vacía
          </p>
          <p className="text-[11px] text-[#8A8478] mb-3">
            Arrastra fotos aquí o pulsa para añadir imágenes (admite selección múltiple).
          </p>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenAddModal();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2B2A28] text-white rounded-xl text-xs font-semibold hover:bg-black transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir imágenes
            </button>
          )}
        </div>
      )}

      {/* 3. Modal Añadir Imagen (nodo-galeria.html) */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150"
          onClick={handleCloseAddModal}
        >
          <div
            className="bg-[#221E26] text-white border border-[#413B48] rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-[#EEE9E3]">Añadir imagen a la galería</h3>
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="text-[#9C93A3] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dropzone */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9C93A3]">
                Imagen(es)
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsModalDragOver(true);
                }}
                onDragLeave={() => setIsModalDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsModalDragOver(false);
                  if (e.dataTransfer.files?.length > 0) {
                    processFiles(e.dataTransfer.files);
                  }
                }}
                className={`border-1.5 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all relative overflow-hidden bg-[#17141A] ${
                  isModalDragOver
                    ? 'border-[#4FC7AE] bg-[#2A2530]'
                    : 'border-[#413B48] hover:border-[#4FC7AE]'
                } ${modalFiles.length > 0 ? 'p-0 border-solid' : ''}`}
              >
                {modalFiles.length > 0 ? (
                  <div className="relative">
                    <img
                      src={modalFiles[0].url}
                      alt="Preview"
                      className="w-full max-h-40 object-cover block"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-[#17141A]/80 backdrop-blur-xs p-2 text-left flex items-center justify-between text-[11px] font-mono text-white/90">
                      <span className="truncate max-w-[200px]">{modalFiles[0].file.name}</span>
                      {modalFiles.length > 1 && (
                        <span className="bg-[#4FC7AE] text-[#17141A] px-1.5 py-0.2 rounded font-bold text-[10px]">
                          +{modalFiles.length - 1} más
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-[#9C93A3]">
                    <Upload className="w-6 h-6 mx-auto mb-1 text-[#645C6C]" />
                    <div className="text-xs text-[#EEE9E3] font-medium">
                      Arrastra una o varias imágenes o pulsa para elegir
                    </div>
                    <div className="text-[10px] text-[#645C6C] mt-0.5">JPG, PNG o WEBP</div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files) processFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </div>
            </div>

            {/* Título */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9C93A3]">
                Título
              </label>
              <input
                type="text"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                placeholder="Sin título"
                className="w-full bg-[#17141A] border border-[#302B35] rounded-xl px-3 py-2 text-xs text-[#EEE9E3] outline-none focus:border-[#E8A33D] font-sans"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9C93A3]">
                Descripción (opcional)
              </label>
              <input
                type="text"
                value={modalDesc}
                onChange={(e) => setModalDesc(e.target.value)}
                placeholder="Breve descripción para la tarjeta"
                className="w-full bg-[#17141A] border border-[#302B35] rounded-xl px-3 py-2 text-xs text-[#EEE9E3] outline-none focus:border-[#E8A33D] font-sans"
              />
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#9C93A3] hover:text-white hover:bg-[#332D3A] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                disabled={modalFiles.length === 0}
                className="px-4 py-1.5 bg-[#E8A33D] hover:bg-[#E8A33D]/90 text-[#1F1408] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Añadir {modalFiles.length > 1 ? `(${modalFiles.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal Editar Imagen Existente */}
      {editingItem && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="bg-[#221E26] text-white border border-[#413B48] rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-[#EEE9E3]">Editar información de la foto</h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-[#9C93A3] hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9C93A3]">
                Título
              </label>
              <input
                type="text"
                value={editingItem.title}
                onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                placeholder="Sin título"
                className="w-full bg-[#17141A] border border-[#302B35] rounded-xl px-3 py-2 text-xs text-[#EEE9E3] outline-none focus:border-[#E8A33D]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9C93A3]">
                Descripción
              </label>
              <input
                type="text"
                value={editingItem.description}
                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                placeholder="Breve descripción"
                className="w-full bg-[#17141A] border border-[#302B35] rounded-xl px-3 py-2 text-xs text-[#EEE9E3] outline-none focus:border-[#E8A33D]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#9C93A3] hover:text-white hover:bg-[#332D3A] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onEditImage(editingItem.id, editingItem.title, editingItem.description);
                  setEditingItem(null);
                }}
                className="px-4 py-1.5 bg-[#E8A33D] hover:bg-[#E8A33D]/90 text-[#1F1408] rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const NoteDetail: React.FC<NoteDetailProps> = ({ note, token, onNoteDeleted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const itemInputsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const tags = useLiveQuery(() => db.tags.toArray()) || [];

  const [columnsModal, setColumnsModal] = useState<ColumnsModalState>({
    isOpen: false,
    columns: [],
  });
  const [columnInputText, setColumnInputText] = useState('');
  const cellInputsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  const [focusCellCoord, setFocusCellCoord] = useState<{
    blockId: string;
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  // Estado para el visor Lightbox de galería
  const [lightboxState, setLightboxState] = useState<{
    blockId: string;
    itemIndex: number;
  } | null>(null);
  const [activeLightboxDims, setActiveLightboxDims] = useState<string>('');

  // Estado local sincronizado para garantizar que la edición y la posición del cursor no salten
  const [localNote, setLocalNote] = useState<Note | null>(note);
  const pendingSaveRef = useRef<Note | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // Sincronizar si cambia la nota seleccionada o si llega una actualización externa
  useEffect(() => {
    if (note) {
      if (!localNote || note.id !== localNote.id || (!pendingSaveRef.current && note.updatedAt !== localNote.updatedAt)) {
        setLocalNote(note);
      }
    } else {
      setLocalNote(null);
    }
  }, [note]);

  // Datos del elemento activo en el Lightbox
  const activeGalleryBlock = localNote?.blocks.find(
    (b) => b.id === lightboxState?.blockId && b.type === 'gallery'
  ) as GalleryBlock | undefined;

  const activeGalleryItem =
    activeGalleryBlock && lightboxState
      ? activeGalleryBlock.items[lightboxState.itemIndex]
      : undefined;

  // Sonda de dimensiones naturales de la imagen para el Lightbox (nodo-galeria.html)
  useEffect(() => {
    if (!activeGalleryItem?.url) {
      setActiveLightboxDims('');
      return;
    }
    setActiveLightboxDims('Calculando…');
    const probe = new Image();
    probe.onload = () => {
      setActiveLightboxDims(`${probe.naturalWidth} × ${probe.naturalHeight} px`);
    };
    probe.onerror = () => {
      setActiveLightboxDims('Dimensiones no disponibles');
    };
    probe.src = activeGalleryItem.url;
  }, [activeGalleryItem?.url]);

  // Navegación por teclado en Lightbox (Escape para cerrar, flechas izquierda/derecha para navegar)
  useEffect(() => {
    if (!lightboxState || !activeGalleryBlock) return;

    const handleLightboxKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLightboxState(null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLightboxState((prev) => {
          if (!prev) return null;
          const newIdx =
            prev.itemIndex > 0 ? prev.itemIndex - 1 : activeGalleryBlock.items.length - 1;
          return { ...prev, itemIndex: newIdx };
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLightboxState((prev) => {
          if (!prev) return null;
          const newIdx =
            prev.itemIndex < activeGalleryBlock.items.length - 1 ? prev.itemIndex + 1 : 0;
          return { ...prev, itemIndex: newIdx };
        });
      }
    };

    window.addEventListener('keydown', handleLightboxKeyDown);
    return () => window.removeEventListener('keydown', handleLightboxKeyDown);
  }, [lightboxState, activeGalleryBlock]);

  // Guardar inmediatamente cualquier cambio pendiente al desmontar o cambiar de nota
  const flushSave = () => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (pendingSaveRef.current) {
      const toSave = pendingSaveRef.current;
      pendingSaveRef.current = null;
      db.notes.update(toSave.id, {
        title: toSave.title,
        tag: toSave.tag,
        pinned: toSave.pinned,
        deleted: toSave.deleted,
        blocks: toSave.blocks,
        updatedAt: toSave.updatedAt,
        syncStatus: 'pending',
      });
      scheduleSync(token);
    }
  };

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, []);

  // Guardado con debounce para eventos de tecleo continuo (evita recargas que alteren el cursor)
  const saveChangesDebounced = (updatedNote: Note) => {
    pendingSaveRef.current = updatedNote;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      flushSave();
    }, 300);
  };

  // Guardado inmediato para acciones explícitas (añadir elemento, marcar casilla, fijar, etc.)
  const saveChangesImmediate = async (updatedNote: Note) => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;
    setLocalNote(updatedNote);
    await db.notes.update(updatedNote.id, {
      title: updatedNote.title,
      tag: updatedNote.tag,
      pinned: updatedNote.pinned,
      deleted: updatedNote.deleted,
      blocks: updatedNote.blocks,
      updatedAt: updatedNote.updatedAt,
      syncStatus: 'pending',
    });
    scheduleSync(token);
  };

  // Efecto para enfocar automáticamente solo cuando se crea un nuevo elemento de checklist
  useEffect(() => {
    if (focusItemId) {
      const timer = setTimeout(() => {
        const el = itemInputsRef.current.get(focusItemId);
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
        setFocusItemId(null);
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [focusItemId]);

  // Helper para registrar las referencias de inputs de celdas de tabla (separando desktop y mobile)
  const setCellInputRef = (
    blockId: string,
    rowIndex: number,
    colIndex: number,
    el: HTMLInputElement | null,
    mode: 'desktop' | 'mobile'
  ) => {
    const key = `${mode}_${blockId}_${rowIndex}_${colIndex}`;
    if (el) {
      cellInputsRef.current.set(key, el);
    } else {
      cellInputsRef.current.delete(key);
    }
  };

  // Mover el foco directamente a una celda existente o programarlo si aún no está montada
  const focusCellDirect = (blockId: string, rowIndex: number, colIndex: number) => {
    const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
    const targetMode = isDesktop ? 'desktop' : 'mobile';
    const key = `${targetMode}_${blockId}_${rowIndex}_${colIndex}`;
    const el =
      cellInputsRef.current.get(key) ||
      cellInputsRef.current.get(`desktop_${blockId}_${rowIndex}_${colIndex}`) ||
      cellInputsRef.current.get(`mobile_${blockId}_${rowIndex}_${colIndex}`);
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } else {
      setFocusCellCoord({ blockId, rowIndex, colIndex });
    }
  };

  // Efecto para enfocar automáticamente la primera celda cuando se añade una nueva fila
  useEffect(() => {
    if (focusCellCoord) {
      const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
      const targetMode = isDesktop ? 'desktop' : 'mobile';
      const key = `${targetMode}_${focusCellCoord.blockId}_${focusCellCoord.rowIndex}_${focusCellCoord.colIndex}`;
      const timer = setTimeout(() => {
        const el =
          cellInputsRef.current.get(key) ||
          cellInputsRef.current.get(`desktop_${focusCellCoord.blockId}_${focusCellCoord.rowIndex}_${focusCellCoord.colIndex}`) ||
          cellInputsRef.current.get(`mobile_${focusCellCoord.blockId}_${focusCellCoord.rowIndex}_${focusCellCoord.colIndex}`);
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
        setFocusCellCoord(null);
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [focusCellCoord, localNote]);

  // Historial de cambios para Deshacer / Rehacer (Undo / Redo)
  const pastRef = useRef<NoteSnapshot[]>([]);
  const futureRef = useRef<NoteSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const typingBaselineRef = useRef<NoteSnapshot | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  // Reiniciar historial al cambiar de nota
  const currentNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (note?.id !== currentNoteIdRef.current) {
      currentNoteIdRef.current = note?.id || null;
      pastRef.current = [];
      futureRef.current = [];
      typingBaselineRef.current = null;
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [note?.id]);

  // Guardar instantánea antes de una acción discreta (añadir bloque, eliminar bloque, fijar, etc.)
  const pushDiscreteSnapshot = () => {
    if (!localNote) return;
    if (typingBaselineRef.current) {
      pastRef.current.push(typingBaselineRef.current);
      typingBaselineRef.current = null;
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    }
    pastRef.current.push(createSnapshot(localNote));
    if (pastRef.current.length > 50) pastRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  // Registrar inicio de tecleo para agrupar palabras en el historial
  const registerTypingChange = () => {
    if (!localNote) return;
    if (!typingBaselineRef.current) {
      typingBaselineRef.current = createSnapshot(localNote);
    }
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      if (typingBaselineRef.current) {
        pastRef.current.push(typingBaselineRef.current);
        if (pastRef.current.length > 50) pastRef.current.shift();
        futureRef.current = [];
        setCanUndo(true);
        setCanRedo(false);
        typingBaselineRef.current = null;
      }
      typingTimerRef.current = null;
    }, 700);
  };

  const handleUndo = () => {
    if (!localNote) return;
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingBaselineRef.current) {
      pastRef.current.push(typingBaselineRef.current);
      typingBaselineRef.current = null;
    }

    if (pastRef.current.length === 0) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;

    const currentSnapshot = createSnapshot(localNote);
    futureRef.current.push(currentSnapshot);
    if (futureRef.current.length > 50) futureRef.current.shift();

    const prevSnapshot = pastRef.current.pop()!;
    const restored: Note = {
      ...localNote,
      title: prevSnapshot.title,
      tag: prevSnapshot.tag,
      pinned: prevSnapshot.pinned,
      deleted: prevSnapshot.deleted,
      blocks: prevSnapshot.blocks,
      updatedAt: new Date().toISOString(),
    };

    setLocalNote(restored);
    saveChangesImmediate(restored);

    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    if (!localNote || futureRef.current.length === 0) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingSaveRef.current = null;

    const currentSnapshot = createSnapshot(localNote);
    pastRef.current.push(currentSnapshot);
    if (pastRef.current.length > 50) pastRef.current.shift();

    const nextSnapshot = futureRef.current.pop()!;
    const restored: Note = {
      ...localNote,
      title: nextSnapshot.title,
      tag: nextSnapshot.tag,
      pinned: nextSnapshot.pinned,
      deleted: nextSnapshot.deleted,
      blocks: nextSnapshot.blocks,
      updatedAt: new Date().toISOString(),
    };

    setLocalNote(restored);
    saveChangesImmediate(restored);

    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  };

  const handleUndoRef = useRef(handleUndo);
  handleUndoRef.current = handleUndo;
  const handleRedoRef = useRef(handleRedo);
  handleRedoRef.current = handleRedo;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (localNote?.deleted) return;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      if (!e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoRef.current();
      } else if (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        handleRedoRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localNote?.deleted]);

  if (!localNote) {
    return (
      <div className="flex-1 bg-white flex flex-col items-center justify-center h-full p-8 text-center text-[#8A8478] select-none">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#8A8478]" />
        <p className="text-xs text-[#8A8478]">No hay notas que mostrar</p>
      </div>
    );
  }

  // Toggle fijar / desfijar
  const handleTogglePin = () => {
    pushDiscreteSnapshot();
    const updated: Note = {
      ...localNote,
      pinned: !localNote.pinned,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Cambiar etiqueta
  const handleSelectTag = (tagName: string) => {
    pushDiscreteSnapshot();
    const updated: Note = {
      ...localNote,
      tag: tagName,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Mover a papelera o restaurar
  const handleToggleDelete = async () => {
    const isDeleting = !localNote.deleted;
    const updated: Note = {
      ...localNote,
      deleted: isDeleting,
      updatedAt: new Date().toISOString(),
    };
    await saveChangesImmediate(updated);
    if (isDeleting) {
      onNoteDeleted?.(updated);
    }
  };

  // Eliminar definitivamente
  const handlePermanentDelete = async () => {
    if (window.confirm('¿Seguro que deseas eliminar definitivamente esta nota?')) {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      pendingSaveRef.current = null;
      await db.notes.delete(localNote.id);
      onNoteDeleted?.(localNote);
    }
  };

  // Cambiar título (actualización síncrona en localNote para mantener el cursor en su sitio)
  const handleTitleChange = (newTitle: string) => {
    registerTypingChange();
    const updated: Note = {
      ...localNote,
      title: newTitle,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  // Manipulación de bloques
  const handleAddBlock = (type: 'heading' | 'text' | 'checklist' | 'markdown' | 'gallery') => {
    pushDiscreteSnapshot();
    const newBlockId = `b_${Date.now()}`;
    let newBlock: NoteBlock;

    if (type === 'heading') {
      newBlock = { id: newBlockId, type: 'heading', content: '' };
    } else if (type === 'checklist') {
      const newCheckId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      newBlock = {
        id: newBlockId,
        type: 'checklist',
        items: [{ id: newCheckId, text: '', checked: false }],
      };
      setFocusItemId(newCheckId);
    } else if (type === 'markdown') {
      newBlock = { id: newBlockId, type: 'markdown', content: '', fileName: undefined };
    } else if (type === 'gallery') {
      newBlock = {
        id: newBlockId,
        type: 'gallery',
        title: 'Galería completa',
        items: [],
      };
    } else {
      newBlock = { id: newBlockId, type: 'text', content: '' };
    }

    const updated: Note = {
      ...localNote,
      blocks: [...localNote.blocks, newBlock],
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleUpdateBlockContent = (blockId: string, newContent: string) => {
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && (b.type === 'heading' || b.type === 'text' || b.type === 'markdown')) {
        return { ...b, content: newContent };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  const handleUpdateMarkdownBlock = (blockId: string, newContent: string, fileName?: string) => {
    pushDiscreteSnapshot();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'markdown') {
        return {
          ...b,
          content: newContent,
          ...(fileName !== undefined ? { fileName } : {}),
        };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleMarkdownFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !localNote) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (typeof content !== 'string') return;

      pushDiscreteSnapshot();
      const newBlockId = `b_${Date.now()}`;
      const newBlock: NoteBlock = {
        id: newBlockId,
        type: 'markdown',
        content,
        fileName: file.name,
      };

      const updated: Note = {
        ...localNote,
        blocks: [...localNote.blocks, newBlock],
        updatedAt: new Date().toISOString(),
      };
      saveChangesImmediate(updated);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteBlock = (blockId: string) => {
    pushDiscreteSnapshot();
    const updated: Note = {
      ...localNote,
      blocks: localNote.blocks.filter((b) => b.id !== blockId),
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Manipulación de items de checklist
  const handleToggleCheckItem = (blockId: string, itemIndex: number) => {
    pushDiscreteSnapshot();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = [...b.items];
        newItems[itemIndex] = {
          ...newItems[itemIndex],
          checked: !newItems[itemIndex].checked,
        };
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleUpdateCheckItemText = (
    blockId: string,
    itemIndex: number,
    newText: string
  ) => {
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = [...b.items];
        newItems[itemIndex] = { ...newItems[itemIndex], text: newText };
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  const handleAddCheckItem = (blockId: string, afterIndex?: number) => {
    pushDiscreteSnapshot();
    const newId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItem: ChecklistItem = {
          id: newId,
          text: '',
          checked: false,
        };
        const newItems = [...b.items];
        if (afterIndex !== undefined) {
          newItems.splice(afterIndex + 1, 0, newItem);
        } else {
          newItems.push(newItem);
        }
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setFocusItemId(newId);
    saveChangesImmediate(updated);
  };

  const handleDeleteCheckItem = (blockId: string, itemIndex: number) => {
    pushDiscreteSnapshot();
    const targetBlock = localNote.blocks.find(
      (b) => b.id === blockId && b.type === 'checklist'
    ) as ChecklistBlock | undefined;

    if (targetBlock && itemIndex > 0) {
      const prevItem = targetBlock.items[itemIndex - 1];
      const prevId = prevItem?.id || `${blockId}_${itemIndex - 1}`;
      setFocusItemId(prevId);
    }

    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const newItems = b.items.filter((_, idx) => idx !== itemIndex);
        return { ...b, items: newItems };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleChecklistPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    blockId: string,
    itemIndex: number
  ) => {
    const clipboardText = e.clipboardData.getData('text');
    if (!clipboardText || (!clipboardText.includes('\n') && !clipboardText.includes('\r'))) {
      return;
    }
    e.preventDefault();

    const rawLines = clipboardText.split(/\r?\n/);
    interface ParsedCheckItem {
      text: string;
      explicitChecked: boolean | null;
    }

    const parsedItems: ParsedCheckItem[] = [];

    for (const rawLine of rawLines) {
      let lineText = rawLine.trim();
      let explicitChecked: boolean | null = null;

      // Detectar formato checkbox tipo: - [x], - [ ], [x], [ ], * [x], * [ ]
      const checkboxMatch = lineText.match(/^[-*•–]?\s*\[([ xX])\]\s*(.*)$/);
      if (checkboxMatch) {
        explicitChecked = checkboxMatch[1].toLowerCase() === 'x';
        lineText = checkboxMatch[2].trim();
      } else {
        // Detectar viñetas tipo -, *, • o numeración tipo 1., 2)
        lineText = lineText.replace(/^[-*•–]\s+/, '');
        lineText = lineText.replace(/^\d+[\.\)]\s+/, '');
        lineText = lineText.trim();
      }

      if (lineText.length > 0 || explicitChecked !== null) {
        parsedItems.push({ text: lineText, explicitChecked });
      }
    }

    if (parsedItems.length === 0 || !localNote) return;

    pushDiscreteSnapshot();

    const input = e.currentTarget;
    const selStart = input.selectionStart ?? 0;
    const selEnd = input.selectionEnd ?? 0;

    let lastInsertedId = '';

    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'checklist') {
        const currentItem = b.items[itemIndex];
        const beforeText = currentItem ? currentItem.text.slice(0, selStart) : '';
        const afterText = currentItem ? currentItem.text.slice(selEnd) : '';

        const newItems: ChecklistItem[] = [];
        parsedItems.forEach((pItem, pIdx) => {
          const isFirst = pIdx === 0;
          const isLast = pIdx === parsedItems.length - 1;
          const id =
            isFirst && currentItem?.id
              ? currentItem.id
              : `c_${Date.now()}_${pIdx}_${Math.random().toString(36).substring(2, 6)}`;

          let text = pItem.text;
          if (isFirst) text = beforeText + text;
          if (isLast) text = text + afterText;

          if (isLast) {
            lastInsertedId = id;
          }

          let checked = false;
          if (pItem.explicitChecked !== null) {
            checked = pItem.explicitChecked;
          } else if (isFirst && currentItem) {
            checked = currentItem.checked;
          }

          newItems.push({
            id,
            text,
            checked,
          });
        });

        const spliced = [...b.items];
        spliced.splice(itemIndex, 1, ...newItems);
        return { ...b, items: spliced };
      }
      return b;
    });

    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };

    saveChangesImmediate(updated);
    if (lastInsertedId) {
      setFocusItemId(lastInsertedId);
    }
  };

  // Manipulación de tablas y columnas
  const handleOpenColumnsModal = (blockId?: string) => {
    if (blockId && localNote) {
      const block = localNote.blocks.find((b) => b.id === blockId) as ColumnsBlock | undefined;
      if (block) {
        setColumnsModal({
          isOpen: true,
          blockId,
          columns: block.labels.map((l, i) => ({
            id: `col_${i}_${Date.now()}`,
            name: l,
            originalIndex: i,
          })),
        });
        setColumnInputText('');
        return;
      }
    }
    setColumnsModal({
      isOpen: true,
      blockId: undefined,
      columns: [],
    });
    setColumnInputText('');
  };

  const handleAddModalColumn = () => {
    const trimmed = columnInputText.trim();
    if (!trimmed) return;
    setColumnsModal((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        {
          id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: trimmed,
        },
      ],
    }));
    setColumnInputText('');
  };

  const handleRemoveModalColumn = (colIndex: number) => {
    const colToRemove = columnsModal.columns[colIndex];
    if (columnsModal.blockId && colToRemove.originalIndex !== undefined && localNote) {
      const block = localNote.blocks.find(
        (b) => b.id === columnsModal.blockId
      ) as ColumnsBlock | undefined;
      if (block) {
        const origIdx = colToRemove.originalIndex;
        const hasData = block.rows.some((r) => r[origIdx] && r[origIdx].trim() !== '');
        if (hasData) {
          if (!window.confirm('¿Seguro? Se perderán los datos de esta columna en todas las filas.')) {
            return;
          }
        }
      }
    }

    setColumnsModal((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, idx) => idx !== colIndex),
    }));
  };

  const handleSaveColumnsModal = () => {
    if (columnsModal.columns.length === 0 || !localNote) return;
    pushDiscreteSnapshot();

    const labels = columnsModal.columns.map((c) => c.name);

    if (columnsModal.blockId) {
      const blockId = columnsModal.blockId;
      const block = localNote.blocks.find((b) => b.id === blockId) as ColumnsBlock | undefined;
      if (!block) return;

      const newRows = block.rows.map((oldRow) => {
        return columnsModal.columns.map((col) => {
          if (col.originalIndex !== undefined && oldRow[col.originalIndex] !== undefined) {
            return oldRow[col.originalIndex];
          }
          return '';
        });
      });

      const updatedBlocks = localNote.blocks.map((b) => {
        if (b.id === blockId && b.type === 'columns') {
          return {
            ...b,
            labels,
            rows: newRows,
          } as ColumnsBlock;
        }
        return b;
      });

      const updated: Note = {
        ...localNote,
        blocks: updatedBlocks,
        updatedAt: new Date().toISOString(),
      };
      saveChangesImmediate(updated);
    } else {
      const newBlock: ColumnsBlock = {
        id: `col_block_${Date.now()}`,
        type: 'columns',
        labels,
        rows: [],
      };
      const updated: Note = {
        ...localNote,
        blocks: [...localNote.blocks, newBlock],
        updatedAt: new Date().toISOString(),
      };
      saveChangesImmediate(updated);
    }

    setColumnsModal({ isOpen: false, columns: [] });
    setColumnInputText('');
  };

  const handleAddNewRow = (blockId: string) => {
    if (!localNote) return;
    pushDiscreteSnapshot();
    let newRowIndex = 0;
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'columns') {
        const emptyRow = new Array(b.labels.length).fill('');
        newRowIndex = b.rows.length;
        return {
          ...b,
          rows: [...b.rows, emptyRow],
        };
      }
      return b;
    });

    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
    setFocusCellCoord({ blockId, rowIndex: newRowIndex, colIndex: 0 });
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    block: ColumnsBlock,
    rIdx: number,
    cIdx: number
  ) => {
    const numRows = block.rows.length;
    const numCols = block.labels.length;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (rIdx < numRows - 1) {
        // Mover el cursor a la celda de la misma columna, en la fila siguiente
        focusCellDirect(block.id, rIdx + 1, cIdx);
      } else {
        // Cursor en la última fila: crea fila nueva vacía y mueve el cursor a la primera celda
        handleAddNewRow(block.id);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Retroceso circular dentro de la fila actual
        const prevCol = cIdx > 0 ? cIdx - 1 : numCols - 1;
        focusCellDirect(block.id, rIdx, prevCol);
      } else {
        // Avance circular dentro de la fila actual (nunca crea filas nuevas)
        const nextCol = cIdx < numCols - 1 ? cIdx + 1 : 0;
        focusCellDirect(block.id, rIdx, nextCol);
      }
    }
  };

  const handleUpdateCell = (
    blockId: string,
    rowIndex: number,
    colIndex: number,
    value: string
  ) => {
    if (!localNote) return;
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'columns') {
        const newRows = b.rows.map((row, rIdx) => {
          if (rIdx === rowIndex) {
            const newRow = [...row];
            newRow[colIndex] = value;
            return newRow;
          }
          return row;
        });
        return { ...b, rows: newRows };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  const handleDeleteRow = (blockId: string, rowIndex: number) => {
    if (!localNote) return;
    pushDiscreteSnapshot();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'columns') {
        return {
          ...b,
          rows: b.rows.filter((_, idx) => idx !== rowIndex),
        };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  // Subir imagen local
  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    pushDiscreteSnapshot();
    const reader = new FileReader();
    reader.onload = () => {
      const localUrl = reader.result as string;
      const newBlock: NoteBlock = {
        id: `img_${Date.now()}`,
        type: 'image',
        localUrl,
        caption: file.name,
      };
      const updated: Note = {
        ...localNote,
        blocks: [...localNote.blocks, newBlock],
        updatedAt: new Date().toISOString(),
      };
      saveChangesImmediate(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUpdateCaption = (blockId: string, newCaption: string) => {
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'image') {
        return { ...b, caption: newCaption };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  // Manipulación de Galerías
  const handleUpdateGalleryTitle = (blockId: string, newTitle: string) => {
    if (!localNote) return;
    registerTypingChange();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'gallery') {
        return { ...b, title: newTitle };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    setLocalNote(updated);
    saveChangesDebounced(updated);
  };

  const handleAddGalleryImages = (blockId: string, newItems: GalleryItem[]) => {
    if (!localNote || newItems.length === 0) return;
    pushDiscreteSnapshot();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'gallery') {
        return { ...b, items: [...b.items, ...newItems] };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleDeleteGalleryItem = (blockId: string, itemId: string) => {
    if (!localNote) return;
    pushDiscreteSnapshot();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'gallery') {
        return { ...b, items: b.items.filter((item) => item.id !== itemId) };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const handleEditGalleryItem = (
    blockId: string,
    itemId: string,
    newTitle: string,
    newDescription?: string
  ) => {
    if (!localNote) return;
    pushDiscreteSnapshot();
    const updatedBlocks = localNote.blocks.map((b) => {
      if (b.id === blockId && b.type === 'gallery') {
        return {
          ...b,
          items: b.items.map((item) =>
            item.id === itemId
              ? { ...item, title: newTitle, description: newDescription }
              : item
          ),
        };
      }
      return b;
    });
    const updated: Note = {
      ...localNote,
      blocks: updatedBlocks,
      updatedAt: new Date().toISOString(),
    };
    saveChangesImmediate(updated);
  };

  const activeTag = tags.find((t) => t.name.toLowerCase() === localNote.tag?.toLowerCase());

  return (
    <div className="flex-1 bg-white flex flex-col h-full min-w-0">
      {/* Top Toolbar */}
      <div className="px-8 py-3 border-b border-[#E4DECE] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {localNote.deleted ? (
            <span className="text-xs bg-[#B4553F]/10 text-[#B4553F] px-2 py-1 rounded font-medium">
              Nota en la Papelera
            </span>
          ) : (
            <button
              onClick={handleTogglePin}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                localNote.pinned
                  ? 'border-[#C98A3D] bg-[#C98A3D]/10 text-[#C98A3D] font-semibold'
                  : 'border-[#E4DECE] text-[#8A8478] hover:border-[#2B2A28] hover:text-[#2B2A28]'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{localNote.pinned ? 'Fijada' : 'Fijar'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Tag Selector */}
          {!localNote.deleted && (
            <div className="relative group">
              <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[#E4DECE] text-[#8A8478] hover:border-[#2B2A28] hover:text-[#2B2A28] transition-all">
                <TagIcon className="w-3.5 h-3.5" />
                <span>{localNote.tag || 'Etiqueta'}</span>
              </button>

              {/* Dropdown de etiquetas */}
              <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white border border-[#E4DECE] rounded-xl shadow-lg p-1.5 z-30 min-w-[150px] max-h-64 overflow-y-auto">
                {tags
                  .filter((t: Tag) => !t.parentId && !t.archived)
                  .map((parentTag: Tag) => {
                    const children = tags.filter((t: Tag) => t.parentId === parentTag.id && !t.archived);
                    return (
                      <div key={parentTag.id}>
                        <button
                          onClick={() => handleSelectTag(parentTag.name)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] text-left cursor-pointer"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: parentTag.color }}
                          />
                          <span className="font-medium">{parentTag.name}</span>
                        </button>
                        {children.map((child: Tag) => (
                          <button
                            key={child.id}
                            onClick={() => handleSelectTag(child.name)}
                            className="w-full flex items-center gap-2 pl-6 pr-2.5 py-1 text-[11.5px] rounded-lg hover:bg-[#F7F4EE] text-[#2B2A28] text-left cursor-pointer"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: desaturateColor(child.color) }}
                            />
                            <span>{child.name}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Delete / Restore Button */}
          {localNote.deleted ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleToggleDelete}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#3F6E64] text-white hover:bg-[#345b53] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar</span>
              </button>
              <button
                onClick={handlePermanentDelete}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#B4553F] text-white hover:bg-[#964431] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar definitiva</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleToggleDelete}
              className="p-1.5 text-[#8A8478] hover:text-[#B4553F] hover:bg-[#F7F4EE] rounded-lg transition-colors cursor-pointer"
              title="Mover a papelera"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Block Toolbar */}
      {!localNote.deleted && (
        <div className="px-4 sm:px-8 py-2 bg-[#F7F4EE]/60 border-b border-[#E4DECE] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => handleAddBlock('heading')}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <Heading className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Encabezado</span>
            </button>

            <button
              onClick={() => handleAddBlock('text')}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <Type className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Texto</span>
            </button>

            <button
              onClick={() => handleAddBlock('checklist')}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Lista</span>
            </button>

            <div className="w-[1px] h-4 bg-[#E4DECE] mx-1" />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Imagen</span>
            </button>

            <button
              onClick={() => handleAddBlock('gallery')}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
              title="Añadir galería con diseño mosaico y visor lightbox"
            >
              <Images className="w-3.5 h-3.5 text-[#3F6E64]" />
              <span>Galería</span>
            </button>

            <button
              onClick={() => handleOpenColumnsModal()}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
            >
              <Columns3 className="w-3.5 h-3.5 text-[#8A8478]" />
              <span>Tabla</span>
            </button>

            <div className="w-[1px] h-4 bg-[#E4DECE] mx-1" />

            <button
              type="button"
              onClick={() => mdFileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-white border border-transparent hover:border-[#E4DECE] text-[#2B2A28] transition-all cursor-pointer"
              title="Importar archivo .md con estilos enriquecidos"
            >
              <FileCode className="w-3.5 h-3.5 text-[#3F6E64]" />
              <span>Importar .md</span>
            </button>
          </div>

          {/* Undo / Redo controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${
                canUndo
                  ? 'text-[#2B2A28] hover:bg-white border border-transparent hover:border-[#E4DECE] cursor-pointer'
                  : 'text-[#8A8478]/30 cursor-not-allowed border border-transparent'
              }`}
              title="Deshacer (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Deshacer</span>
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!canRedo}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${
                canRedo
                  ? 'text-[#2B2A28] hover:bg-white border border-transparent hover:border-[#E4DECE] cursor-pointer'
                  : 'text-[#8A8478]/30 cursor-not-allowed border border-transparent'
              }`}
              title="Rehacer (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rehacer</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelected}
            className="hidden"
          />

          <input
            ref={mdFileInputRef}
            type="file"
            accept=".md,.markdown,.txt"
            onChange={handleMarkdownFileSelected}
            className="hidden"
          />
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto w-full select-text">
        <div className="w-[90%] mx-auto py-8">
          {/* Title Input */}
        <input
          type="text"
          value={localNote.title}
          disabled={localNote.deleted}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Título de la nota..."
          className="w-full text-2xl font-bold text-[#2B2A28] outline-none border-none placeholder-[#8A8478]/50 mb-2 font-sans bg-transparent"
        />

        {/* Note Metadata */}
        <div className="flex items-center gap-3 text-xs text-[#8A8478] mb-6 pb-4 border-b border-[#E4DECE]/50">
          {localNote.tag && (
            <span className="flex items-center gap-1.5 bg-[#F7F4EE] border border-[#E4DECE] px-2.5 py-0.5 rounded-full font-medium text-[11px] text-[#2B2A28]">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: activeTag?.parentId
                    ? desaturateColor(activeTag.color)
                    : (activeTag?.color || '#8A8478'),
                }}
              />
              {localNote.tag}
            </span>
          )}
          <span>
            Editada {new Date(localNote.updatedAt).toLocaleString([], {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {localNote.syncStatus === 'synced' && (
            <span className="text-[#3F6E64] flex items-center gap-1">
              <Check className="w-3 h-3" /> Guardada en Dropbox
            </span>
          )}
        </div>

        {/* Blocks rendering */}
        <div className="space-y-4">
          {localNote.blocks.map((block) => (
            <div key={block.id} className="relative group">
              {/* Delete block action on hover */}
              {!localNote.deleted && (
                <button
                  onClick={() => handleDeleteBlock(block.id)}
                  className="opacity-0 group-hover:opacity-100 absolute -left-7 top-1 text-[#8A8478] hover:text-[#B4553F] p-1 rounded transition-opacity"
                  title="Eliminar bloque"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Heading block */}
              {block.type === 'heading' && (
                <input
                  type="text"
                  value={block.content}
                  disabled={localNote.deleted}
                  onChange={(e) => handleUpdateBlockContent(block.id, e.target.value)}
                  placeholder="Encabezado..."
                  className="w-full text-lg font-bold text-[#2B2A28] outline-none bg-transparent placeholder-[#8A8478]/40 border-b border-transparent focus:border-[#E4DECE]"
                />
              )}

              {/* Text block */}
              {block.type === 'text' && (
                <AutoResizeTextBlock
                  value={block.content}
                  disabled={localNote.deleted}
                  onChange={(val) => handleUpdateBlockContent(block.id, val)}
                  placeholder="Escribe aquí... usa **negrita** para resaltar"
                  className="w-full text-sm leading-relaxed text-[#2B2A28] outline-none bg-transparent resize-none placeholder-[#8A8478]/40 font-sans"
                />
              )}

              {/* Checklist block */}
              {block.type === 'checklist' && (
                <div className="space-y-1.5">
                  {block.items.map((item, idx) => {
                    const itemId = item.id || `${block.id}_${idx}`;
                    return (
                      <div key={itemId} className="flex items-center gap-2 group/item">
                        <button
                          type="button"
                          disabled={localNote.deleted}
                          onClick={() => handleToggleCheckItem(block.id, idx)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                            item.checked
                              ? 'bg-[#3F6E64] border-[#3F6E64] text-white'
                              : 'border-[#8A8478] hover:border-[#2B2A28] bg-white'
                          }`}
                        >
                          {item.checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>

                        <input
                          ref={(el) => {
                            if (el) {
                              itemInputsRef.current.set(itemId, el);
                            } else {
                              itemInputsRef.current.delete(itemId);
                            }
                          }}
                          type="text"
                          value={item.text}
                          disabled={localNote.deleted}
                          onChange={(e) =>
                            handleUpdateCheckItemText(block.id, idx, e.target.value)
                          }
                          onPaste={(e) => handleChecklistPaste(e, block.id, idx)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.keyCode === 13) {
                              e.preventDefault();
                              handleAddCheckItem(block.id, idx);
                            } else if (
                              e.key === 'Backspace' &&
                              !item.text &&
                              block.items.length > 1
                            ) {
                              e.preventDefault();
                              handleDeleteCheckItem(block.id, idx);
                            }
                          }}
                          placeholder="Elemento de lista..."
                          className={`w-full text-sm outline-none bg-transparent ${
                            item.checked
                              ? 'line-through text-[#8A8478]'
                              : 'text-[#2B2A28]'
                          }`}
                        />

                        {!localNote.deleted && block.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCheckItem(block.id, idx)}
                            className="opacity-0 group-hover/item:opacity-100 text-[#8A8478] hover:text-[#B4553F] p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {!localNote.deleted && (
                    <button
                      type="button"
                      onClick={() => handleAddCheckItem(block.id)}
                      className="flex items-center gap-2 text-xs text-[#8A8478] hover:text-[#2B2A28] pt-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Añadir elemento</span>
                    </button>
                  )}
                </div>
              )}

              {/* Image block */}
              {block.type === 'image' && (
                <div className="space-y-1.5 my-2">
                  {block.localUrl ? (
                    <img
                      src={block.localUrl}
                      alt={block.caption || 'Imagen de la nota'}
                      className="max-h-72 max-w-md rounded-xl border border-[#E4DECE] object-cover shadow-xs"
                    />
                  ) : (
                    <div className="p-8 border border-dashed border-[#E4DECE] rounded-xl text-center text-xs text-[#8A8478]">
                      Imagen guardada en Google Drive (ID: {block.driveFileId})
                    </div>
                  )}
                  <input
                    type="text"
                    value={block.caption || ''}
                    disabled={localNote.deleted}
                    onChange={(e) => handleUpdateCaption(block.id, e.target.value)}
                    placeholder="Pie de foto opcional..."
                    className="text-xs text-[#8A8478] outline-none bg-transparent w-full italic"
                  />
                </div>
              )}

              {/* Columns / Table block */}
              {block.type === 'columns' && (
                <div className="space-y-2 my-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8A8478]">
                      <Columns3 className="w-3.5 h-3.5" />
                      <span>
                        Tabla ({block.labels.length}{' '}
                        {block.labels.length === 1 ? 'columna' : 'columnas'})
                      </span>
                    </div>
                    {!localNote.deleted && (
                      <button
                        type="button"
                        onClick={() => handleOpenColumnsModal(block.id)}
                        className="flex items-center gap-1 text-[11px] text-[#8A8478] hover:text-[#2B2A28] bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                        title="Configurar columnas"
                      >
                        <Settings2 className="w-3 h-3" />
                        <span>Columnas</span>
                      </button>
                    )}
                  </div>

                  {/* Desktop view: HTML Table */}
                  <div className="hidden md:block overflow-x-auto border border-[#E4DECE] rounded-xl bg-white shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#F7F4EE] border-b border-[#E4DECE]">
                          {block.labels.map((label, lIdx) => (
                            <th
                              key={lIdx}
                              className="px-3 py-2 font-semibold text-[#2B2A28] border-r border-[#E4DECE] last:border-r-0"
                            >
                              {label}
                            </th>
                          ))}
                          {!localNote.deleted && <th className="w-8 px-2 py-2"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4DECE]/70">
                        {block.rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="group/row hover:bg-[#FAF9F5] transition-colors"
                          >
                            {block.labels.map((_, cIdx) => (
                              <td
                                key={cIdx}
                                className="p-0 border-r border-[#E4DECE]/70 last:border-r-0"
                              >
                                <input
                                  type="text"
                                  ref={(el) => setCellInputRef(block.id, rIdx, cIdx, el, 'desktop')}
                                  value={row[cIdx] || ''}
                                  disabled={localNote.deleted}
                                  onChange={(e) =>
                                    handleUpdateCell(block.id, rIdx, cIdx, e.target.value)
                                  }
                                  onKeyDown={(e) => handleCellKeyDown(e, block, rIdx, cIdx)}
                                  placeholder="..."
                                  className="w-full px-3 py-2 text-xs text-[#2B2A28] bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-[#C98A3D]/40"
                                />
                              </td>
                            ))}
                            {!localNote.deleted && (
                              <td className="px-2 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(block.id, rIdx)}
                                  className="opacity-0 group-hover/row:opacity-100 p-1 text-[#8A8478] hover:text-[#B4553F] rounded transition-opacity cursor-pointer"
                                  title="Eliminar fila"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {block.rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={block.labels.length + (localNote.deleted ? 0 : 1)}
                              className="px-3 py-4 text-center text-[#8A8478]/60 italic text-xs"
                            >
                              Sin filas todavía
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile view: Stacked Mini-cards */}
                  <div className="block md:hidden space-y-2.5">
                    {block.rows.map((row, rIdx) => (
                      <div
                        key={rIdx}
                        className="bg-[#FAF9F5] border border-[#E4DECE] rounded-xl p-3 relative group"
                      >
                        {!localNote.deleted && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(block.id, rIdx)}
                            className="absolute top-2 right-2 p-1 text-[#8A8478] hover:text-[#B4553F] rounded cursor-pointer"
                            title="Eliminar fila"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* First column as title */}
                        {block.labels.length > 0 && (
                          <div className="pr-6 mb-2">
                            <input
                              type="text"
                              ref={(el) => setCellInputRef(block.id, rIdx, 0, el, 'mobile')}
                              value={row[0] || ''}
                              disabled={localNote.deleted}
                              onChange={(e) =>
                                handleUpdateCell(block.id, rIdx, 0, e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, block, rIdx, 0)}
                              placeholder={block.labels[0] || 'Elemento...'}
                              className="w-full text-sm font-bold text-[#2B2A28] bg-transparent outline-none border-b border-transparent focus:border-[#E4DECE]"
                            />
                          </div>
                        )}
                        {/* Remaining columns stacked */}
                        <div className="space-y-1.5 pt-1">
                          {block.labels.slice(1).map((lbl, cOffset) => {
                            const cIdx = cOffset + 1;
                            return (
                              <div key={cIdx} className="flex items-center gap-2 text-xs">
                                <span className="text-[#8A8478] font-medium shrink-0 min-w-[70px]">
                                  {lbl}:
                                </span>
                                <input
                                  type="text"
                                  ref={(el) => setCellInputRef(block.id, rIdx, cIdx, el, 'mobile')}
                                  value={row[cIdx] || ''}
                                  disabled={localNote.deleted}
                                  onChange={(e) =>
                                    handleUpdateCell(block.id, rIdx, cIdx, e.target.value)
                                  }
                                  onKeyDown={(e) => handleCellKeyDown(e, block, rIdx, cIdx)}
                                  placeholder="..."
                                  className="flex-1 text-[#2B2A28] bg-transparent outline-none border-b border-transparent focus:border-[#E4DECE] py-0.5"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {block.rows.length === 0 && (
                      <div className="p-3 text-center text-[#8A8478]/60 italic text-xs border border-dashed border-[#E4DECE] rounded-xl">
                        Sin filas todavía
                      </div>
                    )}
                  </div>

                  {/* Add Row Button */}
                  {!localNote.deleted && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => handleAddNewRow(block.id)}
                        className="flex items-center gap-1.5 text-xs text-[#8A8478] hover:text-[#2B2A28] py-1 px-1.5 rounded-lg hover:bg-black/5 cursor-pointer font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Añadir fila</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Markdown block */}
              {block.type === 'markdown' && (
                <MarkdownBlockItem
                  block={block}
                  disabled={localNote.deleted}
                  onUpdateContent={(newContent) =>
                    handleUpdateBlockContent(block.id, newContent)
                  }
                  onReplaceFile={(newContent, fileName) =>
                    handleUpdateMarkdownBlock(block.id, newContent, fileName)
                  }
                />
              )}

              {/* Gallery block */}
              {block.type === 'gallery' && (
                <GalleryBlockView
                  block={block}
                  disabled={localNote.deleted}
                  onUpdateTitle={(newTitle) => handleUpdateGalleryTitle(block.id, newTitle)}
                  onAddImages={(newItems) => handleAddGalleryImages(block.id, newItems)}
                  onDeleteImage={(itemId) => handleDeleteGalleryItem(block.id, itemId)}
                  onEditImage={(itemId, newTitle, newDesc) =>
                    handleEditGalleryItem(block.id, itemId, newTitle, newDesc)
                  }
                  onOpenLightbox={(itemIndex) =>
                    setLightboxState({ blockId: block.id, itemIndex })
                  }
                />
              )}
            </div>
          ))}

          {/* Quick Add block buttons if empty */}
          {localNote.blocks.length === 0 && !localNote.deleted && (
            <div className="border border-dashed border-[#E4DECE] rounded-xl p-6 text-center text-[#8A8478] space-y-3">
              <p className="text-xs">Esta nota está vacía. Añade tu primer bloque:</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => handleAddBlock('heading')}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28]"
                >
                  + Encabezado
                </button>
                <button
                  onClick={() => handleAddBlock('text')}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28]"
                >
                  + Párrafo
                </button>
                <button
                  onClick={() => handleAddBlock('checklist')}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28] cursor-pointer"
                >
                  + Checklist
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28] flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-[#8A8478]" />
                  <span>+ Imagen</span>
                </button>
                <button
                  onClick={() => handleAddBlock('gallery')}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28] flex items-center gap-1.5 cursor-pointer"
                >
                  <Images className="w-3.5 h-3.5 text-[#3F6E64]" />
                  <span>+ Galería</span>
                </button>
                <button
                  onClick={() => handleOpenColumnsModal()}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28] flex items-center gap-1.5 cursor-pointer"
                >
                  <Columns3 className="w-3.5 h-3.5 text-[#8A8478]" />
                  <span>+ Tabla</span>
                </button>
                <button
                  type="button"
                  onClick={() => mdFileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] rounded-lg text-xs font-medium text-[#2B2A28] flex items-center gap-1.5 cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-[#3F6E64]" />
                  <span>+ Importar .md</span>
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Column Configuration Modal */}
      {columnsModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E4DECE] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Columns3 className="w-5 h-5 text-[#2B2A28]" />
                <h3 className="font-semibold text-base text-[#2B2A28]">
                  {columnsModal.blockId ? 'Editar columnas' : 'Nueva tabla'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setColumnsModal({ isOpen: false, columns: [] })}
                className="text-[#8A8478] hover:text-[#2B2A28] p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#8A8478]">
              Define las columnas para organizar tus datos (ej. Nombre, Ocupación, Teléfono).
            </p>

            {/* Input to add column */}
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={columnInputText}
                onChange={(e) => setColumnInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddModalColumn();
                  }
                }}
                placeholder="Nombre de la columna..."
                className="flex-1 bg-[#FAF9F5] border border-[#E4DECE] rounded-lg px-3 py-2 text-xs text-[#2B2A28] outline-none focus:border-[#2B2A28] focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={handleAddModalColumn}
                disabled={!columnInputText.trim()}
                className="px-3 py-2 bg-[#F7F4EE] hover:bg-[#EFEBE2] border border-[#E4DECE] text-[#2B2A28] text-xs font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir</span>
              </button>
            </div>

            {/* Column chips */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-[#8A8478]">
                Columnas ({columnsModal.columns.length}):
              </div>
              {columnsModal.columns.length === 0 ? (
                <div className="text-xs text-[#8A8478]/70 italic py-2">
                  Escribe un encabezado y pulsa Enter o Añadir.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                  {columnsModal.columns.map((col, idx) => (
                    <span
                      key={col.id}
                      className="inline-flex items-center gap-1.5 bg-[#F7F4EE] border border-[#E4DECE] px-2.5 py-1 rounded-lg text-xs font-medium text-[#2B2A28]"
                    >
                      <span>{col.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveModalColumn(idx)}
                        className="text-[#8A8478] hover:text-[#B4553F] p-0.5 rounded cursor-pointer transition-colors"
                        title="Eliminar columna"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E4DECE]">
              <button
                type="button"
                onClick={() => setColumnsModal({ isOpen: false, columns: [] })}
                className="px-3.5 py-2 text-xs font-medium text-[#8A8478] hover:text-[#2B2A28] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveColumnsModal}
                disabled={columnsModal.columns.length === 0}
                className="px-4 py-2 bg-[#2B2A28] hover:bg-[#403E3B] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {columnsModal.blockId ? 'Guardar columnas' : 'Crear tabla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal (nodo-galeria.html) */}
      {lightboxState && activeGalleryBlock && activeGalleryItem && (
        <div
          className="fixed inset-0 bg-[#0A080C]/92 backdrop-blur-md flex flex-col items-center justify-center z-[110] p-4 sm:p-10 select-none animate-in fade-in duration-200"
          onClick={() => setLightboxState(null)}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setLightboxState(null)}
            className="absolute top-5 right-6 w-9 h-9 rounded-xl flex items-center justify-center text-[#9C93A3] hover:text-white bg-[#1F1C22]/80 hover:bg-[#2A2530] border border-[#413B48] transition-all cursor-pointer shadow-lg z-20"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Navigation buttons */}
          {activeGalleryBlock.items.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxState((prev) => {
                    if (!prev) return null;
                    const newIdx =
                      prev.itemIndex > 0
                        ? prev.itemIndex - 1
                        : activeGalleryBlock.items.length - 1;
                    return { ...prev, itemIndex: newIdx };
                  });
                }}
                className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:text-white bg-black/50 hover:bg-black/80 border border-white/10 backdrop-blur-xs transition-all cursor-pointer shadow-xl z-20"
                title="Foto anterior (←)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxState((prev) => {
                    if (!prev) return null;
                    const newIdx =
                      prev.itemIndex < activeGalleryBlock.items.length - 1
                        ? prev.itemIndex + 1
                        : 0;
                    return { ...prev, itemIndex: newIdx };
                  });
                }}
                className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:text-white bg-black/50 hover:bg-black/80 border border-white/10 backdrop-blur-xs transition-all cursor-pointer shadow-xl z-20"
                title="Siguiente foto (→)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Figure & Caption */}
          <div
            className="max-w-[min(900px,90vw)] max-h-[calc(100vh-140px)] flex flex-col items-center w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={activeGalleryItem.url}
              alt={activeGalleryItem.title || 'Foto'}
              className="max-w-full max-h-[calc(100vh-200px)] rounded-xl object-contain shadow-2xl block border border-white/10"
            />
            <div className="w-full mt-3.5 flex items-end justify-between gap-4 px-1">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white text-sm sm:text-base leading-tight truncate">
                  {activeGalleryItem.title || 'Sin título'}
                </h3>
                {activeGalleryItem.description && (
                  <p className="text-xs text-[#9C93A3] mt-1 line-clamp-2">
                    {activeGalleryItem.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {activeGalleryBlock.items.length > 1 && (
                  <span className="font-mono text-xs text-[#8A8478] bg-[#1F1C22] px-2 py-0.5 rounded border border-[#413B48]">
                    {lightboxState.itemIndex + 1} / {activeGalleryBlock.items.length}
                  </span>
                )}
                <span className="font-mono text-xs text-[#4FC7AE] whitespace-nowrap">
                  {activeLightboxDims}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

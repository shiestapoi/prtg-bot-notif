import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { UploadCloud, FileAudio, Trash2, PlayCircle, StopCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface SoundFile {
  name: string;
  size: number;
  createdAt: string;
  url: string;
}

export default function AlarmSoundsPage() {
  const [sounds, setSounds] = useState<SoundFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchSounds = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/sounds');
      setSounds(res.data);
    } catch (error) {
      toast.error('Gagal memuat daftar suara');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSounds();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [fetchSounds]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files[0]);
      // Reset input value so the same file can be selected again
      e.target.value = '';
    }
  };

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'wav' && ext !== 'mp3') {
      toast.error('Hanya format .wav dan .mp3 yang diizinkan');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 10MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(0);
      await axios.post('/api/sounds/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        },
      });
      toast.success('File berhasil diunggah');
      fetchSounds();
    } catch (error) {
      console.error(error);
      toast.error('Gagal mengunggah file');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Yakin ingin menghapus ${filename}?`)) return;
    try {
      await axios.delete(`/api/sounds/${filename}`);
      toast.success('File berhasil dihapus');
      fetchSounds();
      if (playingSound === filename) {
        stopAudio();
      }
    } catch (error) {
      toast.error('Gagal menghapus file');
    }
  };

  const playAudio = (sound: SoundFile) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(sound.url);
    audio.play();
    audioRef.current = audio;
    setPlayingSound(sound.name);

    audio.onended = () => {
      setPlayingSound(null);
    };
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingSound(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">Manajemen Suara Alarm</h1>
        <p className="text-slate-400 mt-2">
          Kelola file audio (.wav, .mp3) yang dapat digunakan sebagai suara notifikasi/alarm sistem.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
        }`}
      >
        <input
          type="file"
          accept=".wav,.mp3"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={uploadProgress !== null}
        />
        <div className="flex flex-col items-center space-y-4 text-center pointer-events-none">
          <div className={`p-4 rounded-full ${isDragging ? 'bg-blue-500/20' : 'bg-slate-700'}`}>
            <UploadCloud className={`w-8 h-8 ${isDragging ? 'text-blue-400' : 'text-slate-400'}`} />
          </div>
          <div>
            <p className="text-lg font-medium text-slate-200">
              Klik atau Seret file suara ke area ini
            </p>
            <p className="text-sm text-slate-400 mt-1">Mendukung .WAV dan .MP3 hingga 10MB</p>
          </div>
        </div>

        {uploadProgress !== null && (
          <div className="absolute inset-0 bg-slate-900/80 rounded-xl flex flex-col items-center justify-center p-8 backdrop-blur-sm z-10">
            <p className="text-sm font-medium text-blue-400 mb-4">Mengunggah file... {uploadProgress}%</p>
            <div className="w-full max-w-md bg-slate-700 h-3 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300 ease-out rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <FileAudio className="w-5 h-5 text-slate-400" />
            Daftar File Suara
          </h2>
          <button
            onClick={fetchSounds}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Memuat daftar suara...</div>
        ) : sounds.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <FileAudio className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-slate-400">Belum ada file suara yang diunggah.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {sounds.map((sound) => (
              <div key={sound.name} className="p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-700 shadow-inner">
                    <FileAudio className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">{sound.name}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {(sound.size / 1024).toFixed(1)} KB • Diunggah {new Date(sound.createdAt).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {playingSound === sound.name ? (
                    <button
                      onClick={stopAudio}
                      className="p-2 text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors"
                      title="Stop"
                    >
                      <StopCircle className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => playAudio(sound)}
                      className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors"
                      title="Play"
                    >
                      <PlayCircle className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(sound.name)}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                    title="Hapus"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

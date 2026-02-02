import { open } from '@tauri-apps/plugin-shell'
import React from 'react'

import Divider from '@/components/Divider'
import Icon from '@/components/Icon'
import Image from '@/components/Image'
import Title from '@/components/Title'
import TauriLink from '@/tauri/components/Link'

function About() {
  const [showHowItWorks, setShowHowItWorks] = React.useState(false)

  return (
    <section className="px-4 py-10 w-full max-h-[80vh] overflow-y-auto">
      <section className="mb-6">
        <Title title="About" iconProps={{ name: 'info' }} />
      </section>
      <section>
        <div className="z-10 flex justify-center items-center">
          <h2 className="text-3xl mr-2 font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            compressO
          </h2>
          <Image
            disableAnimation
            src="/logo.png"
            alt="logo"
            width={50}
            height={50}
          />
        </div>
        <p className="text-center italic text-gray-600 dark:text-gray-400 text-sm my-1">
          Compress any video to a tiny size.
        </p>
      </section>

      <section className="my-6">
        <button
          type="button"
          className="w-full flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-3 text-left"
          onClick={() => setShowHowItWorks(!showHowItWorks)}
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            How It Works
          </span>
          <span
            className={`text-gray-500 transition-transform duration-200 ${showHowItWorks ? 'rotate-180' : ''}`}
          >
            ▼
          </span>
        </button>

        {showHowItWorks && (
          <div className="mt-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg px-4 py-4 text-sm text-gray-600 dark:text-gray-400 space-y-4">
            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                What does CompressO do?
              </h4>
              <p>
                CompressO reduces video file sizes by re-encoding them with
                smarter compression. Your original file stays untouched - we
                create a new, smaller version. Most videos can be reduced by
                50-90% with minimal visible quality loss.
              </p>
            </div>

            <Divider className="dark:bg-zinc-700" />

            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Quality Slider
              </h4>
              <p>
                <strong>Higher quality</strong> = larger file, better image.
                <br />
                <strong>Lower quality</strong> = smaller file, more compression
                artifacts.
                <br />
                <span className="text-xs mt-1 block">
                  Tip: 70% is a good balance for most videos. Go higher for
                  important footage, lower for casual sharing.
                </span>
              </p>
            </div>

            <Divider className="dark:bg-zinc-700" />

            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Presets
              </h4>
              <p>
                <strong>Thunderbolt:</strong> Fast compression. Great when you
                need results quickly.
                <br />
                <strong>Default:</strong> Slower but achieves smaller file sizes
                at the same quality. Best for archiving or when file size
                matters most.
              </p>
            </div>

            <Divider className="dark:bg-zinc-700" />

            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Output Formats
              </h4>
              <p>
                <strong>MP4:</strong> Works everywhere. Best default choice.
                <br />
                <strong>MOV:</strong> Preferred for Apple devices and editors.
                <br />
                <strong>MKV:</strong> Flexible format, great for archiving.
                <br />
                <strong>WebM:</strong> Optimized for web. Smaller files but
                slower to compress.
                <br />
                <strong>AVI:</strong> Legacy format for older software.
              </p>
            </div>

            <Divider className="dark:bg-zinc-700" />

            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Other Options
              </h4>
              <p>
                <strong>Resolution:</strong> Reducing dimensions (e.g., 4K to
                1080p) dramatically cuts file size.
                <br />
                <strong>FPS:</strong> Lowering frame rate (e.g., 60 to 30) saves
                space for videos without fast motion.
                <br />
                <strong>Mute Audio:</strong> Removes the audio track entirely.
              </p>
            </div>

            <Divider className="dark:bg-zinc-700" />

            <div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Is it safe?
              </h4>
              <p>
                Yes. CompressO never modifies or deletes your original files.
                All processing happens locally on your computer - nothing is
                uploaded to the internet.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="my-6">
        <p className="text-center text-gray-600 dark:text-gray-400 text-sm my-1">
          Powered by{' '}
          <TauriLink href="https://ffmpeg.org/" className="text-lg">
            FFmpeg
          </TauriLink>
          <span className="block text-sm max-w-[400px] mx-auto">
            This software uses libraries from the FFmpeg project under the
            LGPLv2.1.
          </span>
        </p>
      </section>
      <section>
        <p className="text-center text-gray-600 dark:text-gray-400 text-sm my-1">
          Made with <Icon className="inline text-primary" name="lowResHeart" />{' '}
          in public by{' '}
          <TauriLink href="https://www.threads.net/@codeforreal">
            Code For Real
          </TauriLink>
        </p>
      </section>
      <section>
        <p className="text-sm text-center text-gray-600 dark:text-gray-400 my-2  flex items-center justify-center">
          <button
            type="button"
            className="ml-2  flex items-center justify-center gap-2"
            onClick={() => {
              open('https://github.com/codeforreal1/compressO')
            }}
          >
            Free and open-source{' '}
            <Icon
              name="github"
              size={25}
              className="text-gray-800 dark:text-gray-200"
            />
          </button>
        </p>
      </section>
      <p className="self-end text-gray-400 ml-2 text-lg font-bold text-center">
        v{window.__appVersion ?? ''}
      </p>
    </section>
  )
}

export default About
